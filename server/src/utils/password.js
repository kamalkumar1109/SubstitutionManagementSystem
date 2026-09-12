const bcrypt = require("bcryptjs");

const SALT_ROUNDS = 12;

async function hashPassword(plain) {
  if (!plain || typeof plain !== "string" || plain.length < 8) {
    throw new Error("Password must be at least 8 characters");
  }
  return bcrypt.hash(plain, SALT_ROUNDS);
}

async function verifyPassword(plain, passwordHash) {
  if (!plain || !passwordHash) return false;
  return bcrypt.compare(plain, passwordHash);
}

module.exports = { hashPassword, verifyPassword };
