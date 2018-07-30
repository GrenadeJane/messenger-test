'use strict'
const
  debug = require('debug')('app:index'),
  webhookDebug = require('debug')('app:webhook');
const request = require('request');
var express = require('express');
var path = require('path');
var logger = require('morgan');
var bodyParser = require('body-parser');
var app = express();
const PQueue = require('p-queue');
const mongoOxfam = require("./routes/mongoose");
const dataJSON = require('./public/quiz.json');
const chatJSON = require('./public/chat.json');
const emojiJSON = require("emoji-datasource-messenger/emoji.json");
const testemoji = require("emoji-data");

const zero = testemoji.from_unified("0030-FE0F-20E3");
const est = testemoji.find_by_short_name(":zero:");//app); 
// :: Dependencies in the personal code

app.use(logger('dev', 'tiny'));
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(function (err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});

function sleep(ms){
  return new Promise(resolve=>{
      setTimeout(resolve,ms)
  });
}

async function handleMessageQuiz(psid, webhookMessage) {

  const quick_reply = (webhookMessage) ? webhookMessage.quick_reply : null;
  let user = await mongoOxfam.findOne({ "PSID": psid });
  let response;
  if (!user)
    user = await createUser(psid);

  if (quick_reply) {
    user = await saveResult(user, quick_reply.payload);
  }

  const anwsered_count = user.answered.count;
  if (anwsered_count == dataJSON.length) {
    const profil = getProfil(user);
    return response = {
      "text": "Congrats ! Ton profil benevole est :  " + chatJSON.profils[profil].text
    }
  }
  else if (anwsered_count < 0 || anwsered_count > dataJSON.length) {
    user.answered.count = 0;
    await user.save();
    //res.status(400).send({ message: "error of database, please retry " });
  }

  const content = dataJSON[anwsered_count];
  response = createQuickReplies(content);

  return response;
  // res.status(200).send({ content: content, profil: profil, response : response });
}

async function createUser(psid) {
  console.log("create new user with the psid : " + psid);
  let user = new mongoOxfam();
  user.PSID = psid;

  return await user.save();
}

async function incrementCount(user) {
  user.answered.count++;
  return await user.save();
}

async function saveResult(user, payload) {
  const arrayName = payload.split("-");
  user = await mongoOxfam.findByIdAndUpdate(user._id, { $push: { "result": arrayName } });
  return await incrementCount(user);
}

function getProfil(user) {
  const array = user.result;
  if (array.length == 0)
    return null;
  var modeMap = {};
  var maxEl = array[0], maxCount = 1;
  for (var i = 0; i < array.length; i++) {
    var el = array[i];
    if (modeMap[el] == null)
      modeMap[el] = 1;
    else
      modeMap[el]++;
    if (modeMap[el] > maxCount) {
      maxEl = el;
      maxCount = modeMap[el];
    }
  }
  return maxEl;
}

// mark_seen / typing_on / typing_off
async function sendAction(sender_psid, action) {
  let actionResponse = {
    "recipient": {
      "id": sender_psid
    },
    "sender_action": action
  }

  callSendAPIDirect(actionResponse);
}

async function sendTypingOn(sender_psid) {
  sendAction(sender_psid, "typing_on");
}

async function sendTypingOff(sender_psid) {
  sendAction(sender_psid, "typing_off");
}

async function sendMarkSeen(sender_psid ) {
  sendAction(sender_psid, "mark_seen");
}

function test(sender_psid, message) {
  handleMessageQuiz(sender_psid, message).then(result => callSendAPI(sender_psid, result))
}

app.post('/webhook', (req, res) => {
  const body = req.body;
  if (body.object === 'page') {

    body.entry.forEach(entry => {

      // Gets the body of the webhook event
      const webhook_event = entry.messaging[0];
      const  sender_psid = webhook_event.sender.id;
      webhookDebug(webhook_event);

      // Get the sender PSID
      webhookDebug('Sender PSID: ' + sender_psid);
      sendMarkSeen(sender_psid);

      // Check if the event is a message or postback and
      // pass the event to the appropriate handler function
      if (webhook_event.message) {
        if ( webhook_event.message === "recommencer") {
          restartQuiz(sender_psid);
          continue;
        }
        
        sendTypingOn(sender_psid);
        
        handleMessageQuiz(sender_psid, webhook_event.message)
        .then(result => callSendAPI(sender_psid, result))
        .then(() => sendTypingOff(sender_psid))
        .catch(err => console.log("error during the handle of the message quiz "));
    
      } else if (webhook_event.postback) {
        // :: only if restart of start quizz 
        handlePostback(sender_psid, webhook_event);
      }
    });

    res.status(200).send('EVENT_RECEIVED');

  } else {
    res.sendStatus(404);
  }
});

app.get('/webhook', (req, res) => {
  let VERIFY_TOKEN = process.env.PAGE_ACCESS_TOKEN;

  let mode = req.query['hub.mode'];
  let token = req.query['hub.verify_token'];
  let challenge = req.query['hub.challenge'];

  if (mode && token) {
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      webhookDebug('WEBHOOK_VERIFIED');
      res.status(200).send(challenge);
    } else {
      res.sendStatus(404);
    }
  }
});

function createQuickReplies(question) {
  let quick_replies = [];
  let response = {};
  let attachment = {};

  question.answers.forEach(answer => {
    let reply = {};
    reply.content_type = "text";
    reply.title = answer.text;
    reply.payload = answer.payload;

    quick_replies.push(reply);
  });
  attachment.type = "image";
  attachment.payload = {
    "url": question.question,
    "is_reusable": false
  };

  response.attachment = attachment;
  response.quick_replies = quick_replies;

  return response;
}

// Handles messaging_postbacks events
function handlePostback(sender_psid, webhook_event) {

  // Get the payload for the postback
  let payload = webhook_event.postback.payload;

  // start quiz with the start button
  if (payload == "start_quiz")
    startQuiz(sender_psid, webhook_event.message);
  else if (payload == "reset_quiz")
    restartQuiz(sender_psid);
  else if ( payload == "start_conversation")
    startConversation(sender_psid);
}

async function startConversation(sender_psid) {
  let response = { "text": chatJSON.greetings };
  callSendAPI(sender_psid, response);

  sendTypingOn(sender_psid);
  await sleep(1000);
  sendTypingOff(sender_psid);

  let response = {"attachment": chatJSON.reset };
  callSendAPI(sender_psid, response);

  sendTypingOn(sender_psid);
  await sleep(1000);
  sendTypingOff(sender_psid);

  let response = { "text": chatJSON.letsgo };
  callSendAPI(sender_psid, response);
}

function startQuiz(sender_psid, message = null) {
  let response = { "text": chatJSON.letsgo };
  callSendAPI(sender_psid, response);

  sendTypingOn(sender_psid);
  await sleep(1000);
  sendTypingOff(sender_psid);

  handleMessageQuiz(sender_psid, message)
  .then(result => callSendAPI(sender_psid, result));
}

function restartQuiz(sender_psid) {
  mongoOxfam
    .findByIdAndUpdate(sender_psid, { $set: { "answered.count": 0 } })
    .then(() => startQuiz(sender_psid))
    .catch(err => console.log("error during the restart of the quizz "));
}

function callSendAPIDirect(response) {
  // Send the HTTP request to the Messenger Platform
  request({
    "uri": "https://graph.facebook.com/v2.6/me/messages",
    "qs": { "access_token": process.env.PAGE_ACCESS_TOKEN },
    "method": "POST",
    "json": response
  }, (err, res, body) => {
    if (!err) {
      console.log('message sent!')
      console.dir(response);
    } else {
      console.error("Unable to send message:" + err);
    }
  });
}

function callSendAPI(sender_psdi, response) {

  let request_body = {
    "recipient": {
      "id": sender_psdi
    },
    "messaging_type": "response",
    "message": response
  }

  // Send the HTTP request to the Messenger Platform
  request({
    "uri": "https://graph.facebook.com/v2.6/me/messages",
    "qs": { "access_token": process.env.PAGE_ACCESS_TOKEN },
    "method": "POST",
    "json": request_body
  }, (err, res, body) => {
    if (!err) {
      console.log('message sent!')
      console.dir(response);
    } else {
      console.error("Unable to send message:" + err);
    }
  });
}


app.listen(process.env.PORT || 1337, () => debug('listen to ' + process.env.PORT));

