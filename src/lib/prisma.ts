import { PrismaClient } from "../app/generated/prisma/client";

const globalForPrisma = global as unknown as {
	prisma: PrismaClient;
};

function createPrismaClient() {
	// In local dev, use MariaDB adapter with hardcoded local config
	if (process.env.NEXT_PUBLIC_ENV === "DEV") {
		const { PrismaMariaDb } = require("@prisma/adapter-mariadb");
		const adapter = new PrismaMariaDb({
			host: "127.0.0.1",
			port: 3307,
			user: "root",
			password: "",
			database: "gulfshoregroup",
			connectTimeout: 30000,
			connectionLimit: 20,
			acquireTimeout: 30000,
			socketTimeout: 60000,
		} as any);
		return new PrismaClient({ adapter });
	}

	// In production, Prisma v7 requires an adapter - use DATABASE_URL env var
	const { PrismaMariaDb } = require("@prisma/adapter-mariadb");
	const url = new URL(process.env.DATABASE_URL!);
	const adapter = new PrismaMariaDb({
		host: url.hostname,
		port: parseInt(url.port, 10),
		user: url.username,
		password: url.password,
		database: url.pathname.slice(1),
		connectTimeout: 30000,
		connectionLimit: 20,
		acquireTimeout: 30000,
		socketTimeout: 60000,
	} as any);
	return new PrismaClient({ adapter });
}

const prisma = globalForPrisma.prisma || createPrismaClient();

if (process.env.NODE_ENV !== "production") {
	globalForPrisma.prisma = prisma;
}

export default prisma;
export { prisma };
