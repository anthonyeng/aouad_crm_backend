require("dotenv").config();
const bcrypt = require("bcrypt");
const { prisma } = require("../../src/lib/prisma");

async function main() {
    const email = "andrew@aouad.com";
    const password = "ChangeMe123!";
    const fullName = "Andrew";

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await prisma.user.upsert({
        where: { email },
        update: { fullName, passwordHash, role: "ADMIN", isActive: true },
        create: { email, fullName, passwordHash, role: "ADMIN", isActive: true },
    });

    console.log("✅ Admin ready:", { email: user.email, role: user.role });
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
