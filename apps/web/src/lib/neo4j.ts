import neo4j, { Driver, Session, int as neoInt } from "neo4j-driver";

let driver: Driver | null = null;

export function getNeo4jDriver(): Driver {
  if (!driver) {
    driver = neo4j.driver(
      process.env.NEO4J_URI ?? "bolt://localhost:7687",
      neo4j.auth.basic(
        process.env.NEO4J_USER ?? "neo4j",
        process.env.NEO4J_PASSWORD ?? "bharatraksha_neo4j"
      )
    );
  }
  return driver;
}

export async function withNeo4jSession<T>(
  fn: (session: Session) => Promise<T>
): Promise<T> {
  const session = getNeo4jDriver().session();
  try {
    return await fn(session);
  } finally {
    await session.close();
  }
}

export async function closeNeo4j(): Promise<void> {
  if (driver) {
    await driver.close();
    driver = null;
  }
}

export { neoInt };
