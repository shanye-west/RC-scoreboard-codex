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

export function isAuthenticated(req: Request, res: Response, next: NextFunction) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ error: "Unauthorized" });
}

export function isAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.isAuthenticated() && req.user.isAdmin) {
    return next();
  }
  res.status(403).json({ error: "Forbidden - Admin access required" });
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
  app.post("/api/login", (req, res, next) => {
    passport.authenticate("local", (err: Error | null, user: Express.User | false, info: any) => {
      if (err) {
        return next(err);
      }
      if (!user) {
        return res.status(401).json({ error: "Invalid credentials" });
      }
      req.login(user, (err) => {
        if (err) {
          return next(err);
        }
        return res.json({
          id: user.id,
          username: user.username,
          isAdmin: user.isAdmin,
          needsPasswordChange: user.needsPasswordChange,
          playerId: user.playerId
        });
      });
    })(req, res, next);
  });
  
  // Password change endpoint
  app.post("/api/change-password", isAuthenticated, async (req, res) => {
    try {
      // Validate the request
      const { newPassword } = req.body;
      
      if (!req.user) {
        return res.status(401).json({ error: "User not authenticated" });
      }
      
      // Validate that new password is a 4-digit PIN
      if (!/^\d{4}$/.test(newPassword)) {
        return res.status(400).json({ error: "Password must be exactly 4 digits" });
      }
      
      // Update the user's password
      const hashedPassword = await hashPassword(newPassword);
      await db.update(users)
        .set({ 
          passcode: hashedPassword,
          needsPasswordChange: false 
        })
        .where(eq(users.id, req.user.id))
        .returning();
      
      res.status(200).json({ message: "Password changed successfully" });
    } catch (error) {
      console.error("Error changing password:", error);
      res.status(500).json({ error: "Error changing password" });
    }
  });

  app.post("/api/logout", (req, res) => {
    req.logout((err) => {
      if (err) {
        return res.status(500).json({ error: "Error during logout" });
      }
      res.status(200).json({ message: "Logged out successfully" });
    });
  });

  app.get("/api/user", (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ authenticated: false });
    }
    res.json({
      authenticated: true,
      user: {
        id: req.user.id,
        username: req.user.username,
        isAdmin: req.user.isAdmin,
        needsPasswordChange: req.user.needsPasswordChange,
        playerId: req.user.playerId
      },
    });
  });
}