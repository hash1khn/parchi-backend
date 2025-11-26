import { PrismaClient } from '@prisma/client';

/**
 * Generates a unique Parchi ID in the format PK-XXXXX
 * where XXXXX is a 5-digit number (00001-99999)
 */
export async function generateParchiId(
  prisma: PrismaClient,
): Promise<string> {
  const maxAttempts = 100;
  let attempts = 0;

  while (attempts < maxAttempts) {
    // Generate a random 5-digit number (10000-99999)
    const randomNum = Math.floor(Math.random() * 90000) + 10000;
    const parchiId = `PK-${randomNum}`;

    // Check if this ID already exists
    const existing = await prisma.students.findUnique({
      where: { parchi_id: parchiId },
    });

    if (!existing) {
      return parchiId;
    }

    attempts++;
  }

  // Fallback: try sequential numbers if random generation fails
  for (let i = 10000; i <= 99999; i++) {
    const parchiId = `PK-${i}`;
    const existing = await prisma.students.findUnique({
      where: { parchi_id: parchiId },
    });

    if (!existing) {
      return parchiId;
    }
  }

  throw new Error('Unable to generate unique Parchi ID');
}

