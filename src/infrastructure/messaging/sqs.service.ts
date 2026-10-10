import { SQSClient, SendMessageCommand, ReceiveMessageCommand, DeleteMessageCommand } from '@aws-sdk/client-sqs';
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';

@Injectable()
export class SqsService implements OnModuleInit, OnModuleDestroy {
  private client!: SQSClient;

  onModuleInit() {
    this.client = new SQSClient({
      endpoint: process.env.AWS_SQS_ENDPOINT || 'http://127.0.0.1:4566',
      region: process.env.AWS_REGION || 'us-east-1',
      credentials: {
        accessKeyId: 'test', // Dummy credentials for LocalStack
        secretAccessKey: 'test',
      },
    });
  }

  onModuleDestroy() {
    if (this.client) {
      this.client.destroy();
    }
  }

  async sendMessage(queueUrl: string, messageBody: string, messageGroupId: string, deduplicationId: string) {
    const command = new SendMessageCommand({
      QueueUrl: queueUrl,
      MessageBody: messageBody,
      MessageGroupId: messageGroupId,
      MessageDeduplicationId: deduplicationId,
    });
    return this.client.send(command);
  }

  async receiveMessages(queueUrl: string, maxNumberOfMessages = 10, waitTimeSeconds = 20) {
    const command = new ReceiveMessageCommand({
      QueueUrl: queueUrl,
      MaxNumberOfMessages: maxNumberOfMessages,
      WaitTimeSeconds: waitTimeSeconds,
      AttributeNames: ['All'],
      MessageAttributeNames: ['All'],
    });
    const response = await this.client.send(command);
    return response.Messages || [];
  }

  async deleteMessage(queueUrl: string, receiptHandle: string) {
    const command = new DeleteMessageCommand({
      QueueUrl: queueUrl,
      ReceiptHandle: receiptHandle,
    });
    return this.client.send(command);
  }
}
