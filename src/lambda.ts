import { AwsLambdaReceiver } from '@slack/bolt';
import { createApp } from './app';

const awsLambdaReceiver = new AwsLambdaReceiver({
  signingSecret: process.env.SLACK_SIGNING_SECRET || '',
});

createApp(awsLambdaReceiver);

module.exports.handler = async (event: any, context: any, callback: any) => {
  const handler = await awsLambdaReceiver.start();
  return handler(event, context, callback);
};
