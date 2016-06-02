// node-exec : Node.js 4.3 : XXX -> SNS -> Lambda function -> Slack Incoming WebHooks -> Slack
// see: https://docs.aws.amazon.com/ja_jp/lambda/latest/dg/programming-model.html

'use strict';

var https = require('https');
var util = require('util');
var url = require('url');

var settings = {
  // Required : Slack > Incoming WebHooks > Webhook URL
  // url: 'https://hooks.slack.com/services/xxxxxxxxx/xxxxxxxxx/xxxxxxxxxxxxxxxxxxxxxxxx',

  /*
  // Optional
  data: {
    channel:      "#general",
    username:     "webhookbot",
    text:         "This is posted to #general and comes from a bot named webhookbot.",
    "icon_emoji": ":ghost:"
  },
   */

  /*
  // Optional
  attachments: [
    {
      fallback: "Required text summary of the attachment that is shown by clients that understand attachments but choose not to show them.",
      pretext: "Optional text that should appear above the formatted data",
      color: "#36a64f", // Can either be one of 'good', 'warning', 'danger', or any hex color code
      text: "Optional text that should appear within the attachment",

      // Fields are displayed in a table on the message
      fields: [
        {
          title: "Required Field Title", // The title may not contain markup and will be escaped for you
          value: "Text value of the field. May contain standard message markup and must be escaped as normal. May be multi-line.",
          short: false // Optional flag indicating whether the `value` is short enough to be displayed side-by-side with other values
        },
        ...
      ]
    },
    ...
  ]
   */
};

class SendToSlack {
  constructor() {
    if (!settings.url) throw new Error('url has not been set.');
    this.settings = settings;
    this.postData = {};
  }

  resetPostData() {
    this.postData = {};
    this.postData.data = {};
    this.postData.attachments = [];
    if (this.settings.data) this.postData.data = this.settings.data;
    if (this.settings.attachments) this.postData.attachments = this.settings.attachments;
  }

  // Please be implemented if you want to change the default value.
  setChannel(event) {
    // this.postData.data.channel = '';
  }
  setUsername(event) {
    // this.postData.data.username = '';
  }
  setIconEmoji(event) {
    // this.postData.data.icon_emoji = '';
  }

  setText(event) {
    // NOTE: Implementation is required.
    // this.postData.data.text = 'Please implement.';

    // Sample
    // this.setTextForCloudWatch(event);
  }

  // Please be implemented if necessary.
  setAttachments(event) {
    // this.postData.attachments = [];

    // Sample
    // this.setAttachmentsForCloudWatch(event);
  }

  setTextForCloudWatch(event) {
    var subject = event.Records[0].Sns.Subject;
    var message = event.Records[0].Sns.Message;
    message = JSON.parse(message);

    // threshold
    var thresholdState = message.Trigger.Threshold;
    if (message.Trigger.ComparisonOperator == 'GreaterThanThreshold') {
      thresholdState = '> ' + message.Trigger.Threshold;
    }
    if (message.Trigger.ComparisonOperator == 'GreaterThanOrEqualToThreshold') {
      thresholdState = '>= ' + message.Trigger.Threshold;
    }
    if (message.Trigger.ComparisonOperator == 'LessThanThreshold') {
      thresholdState = '< ' + message.Trigger.Threshold;
    }
    if (message.Trigger.ComparisonOperator == 'LessThanOrEqualToThreshold') {
      thresholdState = '<= ' + message.Trigger.Threshold;
    }

    var text = ''
      + '*'
      + message.OldStateValue + ' -> ' + message.NewStateValue
      + ' : ' + message.Trigger.Namespace
      + ' : ' + message.Trigger.MetricName
      + ' : ' + message.Trigger.Statistic + ' (' + thresholdState + ')'
      + '*' + "\n"
      + '`' + subject + '`' + "\n"
      + '';

    // mention : '@channel' / '@here' / '@ukyooo' / etc.
    if (message.NewStateValue == 'ALARM' && message.Trigger.Namespace == 'AWS/SQS') {
      text += 'To: ' + '@here' + "\n";
    }
    if (message.NewStateValue == 'ALARM' && message.Trigger.Namespace == 'AWS/ELB') {
      text += 'To: ' + '@here' + "\n";
    }

    this.postData.text = text;
  }

  setAttachmentsForCloudWatch(event) {
    var subject = event.Records[0].Sns.Subject;
    var message = event.Records[0].Sns.Message;
    message = JSON.parse(message);

    // color
    var attachmentColor = '#000000';
    /*
      | OldStateValue       | NewStateValue     | color     |
      |---------------------|-------------------|-----------|
      | OK                  | ALARM             | danger    |
      | OK                  | INSUFFICIENT_DATA | warning ? |
      | ALARM               | OK                | good      |
      | ALARM               | INSUFFICIENT_DATA | good      |
      | INSUFFICIENT_DATA   | OK                | good      |
      | INSUFFICIENT_DATA   | ALARM             | danger    |
     */
    if (message.NewStateValue == 'OK') attachmentColor = 'good';
    if (message.NewStateValue == 'ALARM') attachmentColor = 'danger';
    if (message.OldStateValue == 'ALARM' && message.NewStateValue == 'INSUFFICIENT_DATA') attachmentColor = 'good';
    // if (message.OldStateValue == 'OK' && message.NewStateValue == 'INSUFFICIENT_DATA') attachmentColor = 'warning';

    this.postData.attachments = [];
    this.postData.attachments.push({
      color: attachmentColor,
      pretext: '> message = ',
      text: JSON.stringify(message, null, 2) });
    this.postData.attachments.push({
      color: attachmentColor,
      pretext: '> event   = ',
      text: JSON.stringify(event, null, 2) });
  }

  makePostData(event) {
    this.resetPostData();
    this.setChannel(event);
    this.setUsername(event);
    this.setIconEmoji(event);
    this.setText(event);
    this.setAttachments(event);
    if (!this.postData.data.text) throw new Error('text has not been set.');
  }

  makePostDataForFailure(event, e) {
    this.resetPostData();
    this.postData.text = '*Failure* : ' + e.message;
    this.postData.attachments = [];
    this.postData.attachments.push({ color: 'danger', pretext: '> event = ', text: JSON.stringify(event, null, 2) });
  }

  send(context) {
    console.log(this.postData);
    var parsedURL = url.parse(this.settings.url);
    var request = https.request({
      path:     parsedURL.pathname,
      port:     parsedURL.port,
      hostname: parsedURL.hostname,
      method:   'POST'
    }, function (response) {
      response.setEncoding('utf8');
      response.on('data', function (chunk) {
        context.succeed('Success');
      });
    });
    request.on('error', function (e) {
      console.log(e);
      context.fail('Failure');
    });
    request.write(util.format('%j', this.postData));
    request.end();
  }

  handler(event, context) {
    console.log(JSON.stringify(event, null, 2));
    try {
      this.makePostData(event);
    } catch (e) {
      this.makePostDataForFailure(event, e);
    }
    this.send(context);
  }
}

exports.handler = function (event, context) {
  var o = new SendToSlack();
  o.handler(event, context);
}
