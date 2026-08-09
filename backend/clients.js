import Redis from "ioredis";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { S3Client } from "@aws-sdk/client-s3";

const { VALKEY_HOST, VALKEY_PORT = "6379", S3_ENDPOINT, S3_KEY, S3_SECRET } = process.env;

export const redis = new Redis({ host: VALKEY_HOST, port: Number(VALKEY_PORT) });

export const gemini = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
  .getGenerativeModel({ model: "gemini-2.0-flash" });

export const s3 = new S3Client({
  endpoint: S3_ENDPOINT,
  region: "us-east-1",
  credentials: { accessKeyId: S3_KEY, secretAccessKey: S3_SECRET },
  forcePathStyle: true,
});
