import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  QueryCommand,
  UpdateCommand,
  BatchWriteCommand,
} from "@aws-sdk/lib-dynamodb";
import { env } from "./env";

const client = new DynamoDBClient({
  region: env.AWS_REGION,
  credentials: {
    accessKeyId: env.AWS_ACCESS_KEY_ID,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
  },
});

export const ddb = DynamoDBDocumentClient.from(client);
export const tableName = env.DYNAMODB_TABLE_NAME;

export async function putEvent(
  experimentId: string,
  userId: string,
  eventName: string,
  properties: Record<string, unknown>,
  context: Record<string, unknown>,
  ts: string
) {
  const tsMs = new Date(ts).getTime();
  const expiresAt = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;

  await ddb.send(
    new PutCommand({
      TableName: tableName,
      Item: {
        PK: `EXP#${experimentId}`,
        SK: `EVT#${tsMs}#${userId}#${eventName}`,
        GSI1PK: `USER#${userId}`,
        GSI1SK: `EVT#${tsMs}`,
        experimentId,
        userId,
        eventName,
        properties,
        context,
        ts,
        expires_at: expiresAt,
      },
    })
  );
}

export async function batchPutEvents(
  events: Array<{
    experimentId: string;
    userId: string;
    eventName: string;
    properties: Record<string, unknown>;
    context: Record<string, unknown>;
    ts: string;
  }>
) {
  const expiresAt = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;

  // Dedup across the full input: same (experiment, user, ts, eventName) → last-write-wins.
  // Protects against client-side double-fires while allowing distinct event types at the same ms.
  const dedupMap = new Map<string, { PutRequest: { Item: Record<string, unknown> } }>();
  for (const e of events) {
    const tsMs = new Date(e.ts).getTime();
    const PK = `EXP#${e.experimentId}`;
    const SK = `EVT#${tsMs}#${e.userId}#${e.eventName}`;
    dedupMap.set(`${PK}|${SK}`, {
      PutRequest: {
        Item: {
          PK,
          SK,
          GSI1PK: `USER#${e.userId}`,
          GSI1SK: `EVT#${tsMs}`,
          experimentId: e.experimentId,
          userId: e.userId,
          eventName: e.eventName,
          properties: e.properties,
          context: e.context,
          ts: e.ts,
          expires_at: expiresAt,
        },
      },
    });
  }

  const allRequests = Array.from(dedupMap.values());

  const BATCH_SIZE = 25;
  for (let i = 0; i < allRequests.length; i += BATCH_SIZE) {
    const batch = allRequests.slice(i, i + BATCH_SIZE);
    await ddb.send(
      new BatchWriteCommand({
        RequestItems: { [tableName]: batch },
      })
    );
  }
}

export async function getAssignment(
  experimentId: string,
  userId: string
): Promise<{ variant: string; assigned_at: string } | null> {
  const result = await ddb.send(
    new GetCommand({
      TableName: tableName,
      Key: {
        PK: `EXP#${experimentId}`,
        SK: `ASSIGN#${userId}`,
      },
    })
  );
  if (!result.Item) return null;
  return { variant: result.Item.variant, assigned_at: result.Item.assigned_at };
}

export async function putAssignment(
  experimentId: string,
  userId: string,
  variant: string,
  source: string
): Promise<void> {
  const assigned_at = new Date().toISOString();
  try {
    await ddb.send(
      new PutCommand({
        TableName: tableName,
        Item: {
          PK: `EXP#${experimentId}`,
          SK: `ASSIGN#${userId}`,
          GSI1PK: `USER#${userId}`,
          GSI1SK: `ASSIGN#${experimentId}`,
          experimentId,
          userId,
          variant,
          source,
          assigned_at,
        },
        ConditionExpression: "attribute_not_exists(SK)",
      })
    );
  } catch (err: unknown) {
    // ConditionalCheckFailedException means the assignment already exists — that's fine
    if (
      err instanceof Error &&
      err.name !== "ConditionalCheckFailedException"
    ) {
      throw err;
    }
  }
}

export async function getSummary(
  experimentId: string,
  variant: string
): Promise<{ n: number; conversions: number; sum: number; sum_sq: number } | null> {
  const result = await ddb.send(
    new GetCommand({
      TableName: tableName,
      Key: {
        PK: `EXP#${experimentId}`,
        SK: `SUMMARY#${variant}`,
      },
    })
  );
  if (!result.Item) return null;
  return {
    n: result.Item.n ?? 0,
    conversions: result.Item.conversions ?? 0,
    sum: result.Item.sum ?? 0,
    sum_sq: result.Item.sum_sq ?? 0,
  };
}

export async function incrementSummary(
  experimentId: string,
  variant: string,
  eventName: string,
  value: number
) {
  await ddb.send(
    new UpdateCommand({
      TableName: tableName,
      Key: {
        PK: `EXP#${experimentId}`,
        SK: `SUMMARY#${variant}`,
      },
      UpdateExpression:
        "ADD #n :one, #sum :val, sum_sq :val_sq, conversions :conv",
      ExpressionAttributeNames: {
        "#n": "n",
        "#sum": "sum",
      },
      ExpressionAttributeValues: {
        ":one": 1,
        ":val": value,
        ":val_sq": value * value,
        ":conv": eventName === "conversion" ? 1 : 0,
      },
    })
  );
}

export async function queryEvents(
  experimentId: string,
  fromTs?: number,
  limit = 100
) {
  const result = await ddb.send(
    new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: fromTs
        ? "PK = :pk AND SK BETWEEN :start AND :end"
        : "PK = :pk AND begins_with(SK, :prefix)",
      ExpressionAttributeValues: fromTs
        ? {
            ":pk": `EXP#${experimentId}`,
            ":start": `EVT#${fromTs}`,
            ":end": `EVT#~`,
          }
        : {
            ":pk": `EXP#${experimentId}`,
            ":prefix": "EVT#",
          },
      Limit: limit,
    })
  );
  return result.Items ?? [];
}

export async function getSRMFlags(experimentId: string) {
  const result = await ddb.send(
    new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
      ExpressionAttributeValues: {
        ":pk": `EXP#${experimentId}`,
        ":prefix": "SRM#",
      },
    })
  );
  return result.Items ?? [];
}
