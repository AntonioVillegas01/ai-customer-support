import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, type S3Client } from '@aws-sdk/client-s3';
import { type ObjectStoragePort } from '@acs/application';

export class S3ObjectStorageAdapter implements ObjectStoragePort {
  constructor(private readonly client: S3Client) {}
  async put(bucket: string, key: string, body: Buffer, contentType: string): Promise<void> { await this.client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType })); }
  async get(bucket: string, key: string): Promise<Buffer> {
    const result = await this.client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const chunks: Uint8Array[] = [];
    const body = result.Body;
    if (body !== undefined) for await (const chunk of body as AsyncIterable<Uint8Array>) chunks.push(chunk);
    return Buffer.concat(chunks);
  }
  async delete(bucket: string, key: string): Promise<void> { await this.client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })); }
}
