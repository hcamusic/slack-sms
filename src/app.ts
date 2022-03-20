import { App, Receiver } from '@slack/bolt';
import twilioClient from 'twilio';
import { HarmonySite } from 'harmonysite';
import PhoneNumber from 'awesome-phonenumber';
import _ from 'lodash';

const notificationChannel = process.env.NOTIFICATION_CHANNEL || '';
const messageViewId = 'message';

const twilio = twilioClient(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN,
);

const harmonySite = new HarmonySite('https://www.hcamusic.org');

export const createApp = (receiver?: Receiver) => {
  const app = new App({
    signingSecret: process.env.SLACK_SIGNING_SECRET,
    token: process.env.SLACK_BOT_TOKEN,
    ...(process.env.SLACK_APP_TOKEN
      ? {
          socketMode: true,
          appToken: process.env.SLACK_APP_TOKEN,
        }
      : {
          receiver,
        }),
  });

  app.shortcut('sms_chorus', async ({ ack, payload, client }) => {
    await ack();

    const callingUser = payload.user.id;

    const { members } = await client.conversations.members({
      channel: notificationChannel,
    });

    // Check if user is a member of the channel to authorize the request
    if (members?.includes(callingUser)) {
      await client.views.open({
        trigger_id: payload.trigger_id,
        view: {
          callback_id: messageViewId,
          title: {
            type: 'plain_text',
            text: 'SMS the Chorus',
          },
          submit: {
            type: 'plain_text',
            text: 'Submit',
          },
          blocks: [
            {
              type: 'input',
              block_id: 'form',
              element: {
                type: 'plain_text_input',
                multiline: true,
                action_id: 'message',
                placeholder: {
                  type: 'plain_text',
                  text: 'What do you want to send?\n\n',
                },
              },
              label: {
                type: 'plain_text',
                text: 'Message',
              },
              hint: {
                type: 'plain_text',
                text: 'Your message will be prefixed with "HCA:" automatically',
              },
            },
          ],
          type: 'modal',
        },
      });
    } else {
      await client.chat.postEphemeral({
        channel: notificationChannel,
        user: callingUser,
        text: `You haven't been given access to text everyone. If you need access, ask in <#C01212HNHM2|board-discussions>.`,
      });
    }
  });

  const harmonySiteNumbers = async (): Promise<string[]> => {
    const hsUsername = process.env.HARMONYSITE_USERNAME || '';
    const hsPassword = process.env.HARMONYSITE_PASSWORD || '';
    await harmonySite.authorise(hsUsername, hsPassword);

    const membersTable = await harmonySite.browse({
      table: 'members',
      n: 1000,
    });

    const membershipTable = await harmonySite.browse({
      table: 'memberships',
      n: 1000,
    });

    const memberMap = _.keyBy(
      membersTable.records.member,
      (member) => member.id,
    );

    const memberships = _.keyBy(
      membershipTable.records.membership,
      (member) => member.Member,
    );

    const members = membersTable.records.member
      .filter(
        (member: any) =>
          memberships[member.id] &&
          memberships[member.id].Type === 'Member' &&
          memberships[member.id].Status === 'Active' &&
          memberships[member.id].Level === 'Full',
      )
      .map((member: any) => {
        return memberMap[member.id];
      });

    return members
      .map(
        (member: any) =>
          member.MobilePhone || member.HomePhone || member.WorkPhone,
      )
      .filter(_.identity)
      .filter((phone: any) => typeof phone === 'string')
      .map((phone: string) => new PhoneNumber(phone, 'US'))
      .filter((number: PhoneNumber) => number.isValid() && number.isPossible())
      .map((number: PhoneNumber) => number.getNumber())
      .filter(_.identity);
  };

  app.view(messageViewId, async ({ ack, client, body, view }) => {
    await ack();

    const message = (view.state.values.form.message.value || '').trim();
    const user = body.user.id;
    const smsMessage = `HCA: ${message}`;

    if (message.length < 0) {
      await client.chat.postEphemeral({
        channel: notificationChannel,
        user: user,
        text: `You didn't enter a message. Give it another go.`,
      });
      return;
    }

    const numbers = await harmonySiteNumbers();

    await Promise.all(
      numbers.map((number) =>
        twilio.messages.create({
          body: smsMessage,
          from: process.env.TWILIO_NUMBER,
          to: number,
        }),
      ),
    );

    await client.chat.postMessage({
      channel: notificationChannel,
      text: `<@${user}> sent a text to the chorus:\n\n> ${message}`,
    });
  });

  return app;
};
