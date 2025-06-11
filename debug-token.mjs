#!/usr/bin/env node

// Debug script to check getUserByToken function
import { getUserByToken } from './server/auth.js';

async function debugToken() {
  const token = "579ab8e5b1f9f34ec1f0d76cdb4e3a1df4573995fb1579ff12e3f3814f9590ca";
  
  console.log('🔍 Debugging getUserByToken...');
  console.log('Token:', token);
  
  try {
    const user = await getUserByToken(token);
    console.log('User from token:', JSON.stringify(user, null, 2));
    console.log('User isAdmin:', user?.isAdmin);
    console.log('User isAdmin type:', typeof user?.isAdmin);
  } catch (error) {
    console.error('Error:', error);
  }
}

debugToken().catch(console.error);
