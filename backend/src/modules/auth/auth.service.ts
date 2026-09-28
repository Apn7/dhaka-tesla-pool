import { eq, sql } from "drizzle-orm";
import { db, isUniqueViolation } from "../../db/index.js";
import { users } from "../../db/schema.js";
import { hashPassword, verifyPassword } from "../../lib/password.js";

// What the API may show about a user (never the password hash)
const publicUser = { id: users.id, name: users.name, email: users.email, role: users.role };

// Only passengers sign up; drivers and their Teslas come from the seed.
// Returns null if the email is already registered.
export async function signup(input: { name: string; email: string; password: string }) {
  try {
    const [user] = await db
      .insert(users)
      .values({
        name: input.name,
        email: input.email,
        passwordHash: await hashPassword(input.password),
        role: "PASSENGER",
      })
      .returning(publicUser);
    return user;
  } catch (err) {
    // users_email_unique refused it. The insert itself checks it,
    // so two sign-ups with the same email at the same moment can't both win.
    if (isUniqueViolation(err)) return null;
    throw err;
  }
}

// Returns null for an unknown email and for a wrong password alike,
// so login can't be used to find out who has an account
export async function login(email: string, password: string) {
  const [user] = await db
    .select({ ...publicUser, passwordHash: users.passwordHash })
    .from(users)
    .where(sql`lower(${users.email}) = ${email}`); // matches the unique index on lower(email)
  if (!user || !(await verifyPassword(password, user.passwordHash))) return null;
  const { passwordHash: _, ...rest } = user;
  return rest;
}

export async function findUser(id: string) {
  const [user] = await db.select(publicUser).from(users).where(eq(users.id, id));
  return user ?? null;
}
