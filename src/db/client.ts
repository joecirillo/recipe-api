import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import * as schema from './schema'

export function createDb(connectionString: string) {
  // Workers allow at most 6 concurrent connections per invocation; stay under that
  // even with Hyperdrive's own pooling in front of the connection.
  const client = postgres(connectionString, { max: 5 })
  return drizzle(client, { schema })
}
