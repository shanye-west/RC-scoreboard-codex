import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express, Request, Response, NextFunction } from "express";
import session from "express-session";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import bcrypt from "bcrypt";
import { storage } from "./storage";
import { db } from "./db";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";
import { User as SelectUser } from "@shared/schema";

declare global {
  namespace Express {
    interface User extends SelectUser {}
    interface Request {
      user?: typeof users.$inferSelect;
    }
  }
}

const scryptAsync = promisify(scrypt);

// Password hashing function
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

// Password comparison function
async function comparePasswords(supplied: string, stored: string) {
  // Check if we're dealing with a plain 4-digit PIN
  if (stored === "1111" || (!stored.includes('.') && stored.length === 4)) {
    // Direct comparison for 4-digit PIN
    return supplied === stored;
  }
  
  // Check if it's a bcrypt hash (starts with $2b$)
  if (stored.startsWith('$2b$')) {
    // Use bcrypt to compare for legacy admin user
    try {
      return await bcrypt.compare(supplied, stored);
    } catch (error) {
      console.error('Error comparing bcrypt password:', error);
      return false;
    }
  }
  
  // Check if stored password has the expected scrypt format (hash.salt)
  if (!stored || !stored.includes('.')) {
    console.error('Invalid password format in database: missing salt separator');
    // Fallback for direct comparison in case the password was stored incorrectly
    return supplied === stored;
  }
  
  const [hashed, salt] = stored.split(".");
  if (!salt) {
    console.error('Invalid password format in database: salt is missing');
    return supplied === stored;
  }
  
  const hashedBuf = Buffer.from(hashed, "hex");
  const suppliedBuf = (await scryptAsync(supplied, salt, 64)) as Buffer;
  
  // Check if buffers have the same length before using timingSafeEqual
  if (hashedBuf.length !== suppliedBuf.length) {
    console.error('Hash length mismatch:', { hashedLength: hashedBuf.length, suppliedLength: suppliedBuf.length });
    return false;
  }
  
  return timingSafeEqual(hashedBuf, suppliedBuf);
}

export async function getUserByToken(token: string) {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.token, token));
  return user;
}

export function isAuthenticated(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = authHeader.split(' ')[1];
  getUserByToken(token)
    .then(user => {
      if (!user) {
        return res.status(401).json({ error: 'Invalid token' });
      }
      req.user = user;
      next();
    })
    .catch(err => {
      console.error('Error validating token:', err);
      res.status(500).json({ error: 'Internal server error' });
    });
}

export function isAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user?.isAdmin) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

export function setupAuth(app: Express) {
  // Configure session
  const sessionSettings: session.SessionOptions = {
    secret: process.env.SESSION_SECRET || 'rowdy-cup-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      secure: process.env.NODE_ENV === 'production', // Use secure cookies in production
      sameSite: 'lax', // Protect against CSRF
      httpOnly: true, // Prevent JavaScript access to cookies
      path: '/', // Cookie is valid for all paths
    }
  };

  app.use(session(sessionSettings));
  app.use(passport.initialize());
  app.use(passport.session());

  // Configure passport with local strategy
  passport.use(
    new LocalStrategy(async (username, password, done) => {
      try {
        const user = await storage.getUserByUsername(username);
        if (!user || !(await comparePasswords(password, user.passcode))) {
          return done(null, false);
        }
        return done(null, user);
      } catch (err) {
        return done(err);
      }
    })
  );

  // Serialize/deserialize user
  passport.serializeUser((user, done) => {
    done(null, user.id);
  });

  passport.deserializeUser(async (id: number, done) => {
    try {
      const user = await storage.getUser(id);
      done(null, user);
    } catch (err) {
      done(err);
    }
  });

  // Auth endpoints
  app.post("/api/login", async (req: Request, res: Response) => {
    const { username, passcode } = req.body;
    if (!username || !passcode) {
      return res.status(400).json({ error: 'Username and passcode required' });
    }

    try {
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.username, username));

      if (!user || user.passcode !== passcode) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      // Generate new token
      const token = randomBytes(32).toString('hex');
      
      // Update user with new token
      await db
        .update(users)
        .set({ token })
        .where(eq(users.id, user.id));

      res.json({
        user: {
          id: user.id,
          username: user.username,
          isAdmin: user.isAdmin,
          needsPasswordChange: user.needsPasswordChange,
          token
        }
      });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
  
  // Password change endpoint
  app.post("/api/change-password", isAuthenticated, async (req: Request, res: Response) => {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current and new password required' });
    }

    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    try {
      if (user.passcode !== currentPassword) {
        return res.status(401).json({ error: 'Current password is incorrect' });
      }

      // Generate new token
      const token = randomBytes(32).toString('hex');

      // Update user with new password and token
      await db
        .update(users)
        .set({ 
          passcode: newPassword,
          token,
          needsPasswordChange: false
        })
        .where(eq(users.id, user.id));

      res.json({ 
        success: true,
        token
      });
    } catch (error) {
      console.error('Password change error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post("/api/logout", isAuthenticated, async (req: Request, res: Response) => {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    try {
      // Clear token
      await db
        .update(users)
        .set({ token: null })
        .where(eq(users.id, user.id));

      res.json({ success: true });
    } catch (error) {
      console.error('Logout error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.get("/api/user", isAuthenticated, (req: Request, res: Response) => {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    res.json({
      id: user.id,
      username: user.username,
      isAdmin: user.isAdmin,
      needsPasswordChange: user.needsPasswordChange
    });
  });
}