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
const resultsJSON = require('./public/results.json');
const responseJSON = require("./public/response.json");
require('dotenv').config();

var timer;

process.env.PAGE_ACCESS_TOKEN = "EAAebZCVjRo64BANZBJJkUPZCPOHgntDb2ZCaHdkCydCGTFQ1MvtnAZBZAIrFjlCF3ZCuSOQXN4bUr2XkaiZA7B4ho3BSIJBnOYvmtHyjOm1fZBJxhhMG1UmNHZA4SAwJhg9OdU6fKXCEg8eiMnlmnRjWNJiE31VuI7raUFFjCcOWbljwZDZD";
process.env.PAGE_URL="https://oxfam-bot.baku-digital.be"

// :: Dependencies in the personal code


// # utils region
 
function sleep(ms) {
  return new Promise(resolve => {
    setTimeout(resolve, ms)
  });
}


// # utils end region


async function sendMultipleResponse(user) {
  // :: send the next response of the chain
    sendTextAnswer(user.PSID, responseJSON[user.answered.count].master_response[user.waitingResponseCount])
    .then(() => goToNextChainedQuestion(user))
    .then((newCount) => {
     // :: if this is the last response of the chain, continue to the chain, send the next quiz's question
      if (newCount >= responseJSON[user.answered.count].master_response.length) {
        continueQuizAfterUserResponse(user);
      }
      return user;
    })
    .catch((err) => { console.log('error during the load of the next chained question ' + err); resetQuestionOptions(); });
}

async function continueQuizAfterUserResponse(user)
{
  resetQuestionOptions(user)
    .then(resultUser => goToNextQuestion(resultUser))
    .then(resultUser => handleMessageQuiz(resultUser.PSID))
    .catch(err => console.log("error during the handle quiz after handle the chained question " + err));
}

async function goToNextChainedQuestion(user) {
  user.waitingResponseCount++;
  await user.save();
  return user.waitingResponseCount;
}

async function goToNextQuestion(user) {
  user.answered.count++;
  return await user.save();
}

async function resetQuestionOptions(user) {
  user.waitingResponseCount = 0;
  user.waitForUserResponse = false;
  user.waitingResponseCount = false;
  return await user.save();
}

async function delayWaitingUserAnswer(sender_psid)
{
  await sleep(10000);
  let user = await mongoOxfam.DataModel.findOne({ "PSID": sender_psid });//{ $set: { "waitForUserResponse": state } });
  if ( user.waitForUserResponse ) 
  {
    await sendTextAnswer(sender_psid, { "text": chatJSON.bot_wait });
    continueQuizAfterUserResponse(user);
  }
}

async function answerToPayload(user, questionIndex, payloadIndex) {
  const responsePayload = responseJSON[questionIndex];
  let waitResponse = false;
 
  // one response for all the payload
  if (responsePayload.master_response) {
    // if there is more than one sentence, wait that the user answer between them
  
    // bot send text answer 
    await sendMultipleResponse(user);
    
    if (responsePayload.master_response.length > 1 )
    {
      await changeWaitStatusUser(user.PSID, true);
      waitResponse = true;
     //delayWaitingUserAnswer(user.PSID);
    }
  } else {
    if (responsePayload[payloadIndex].response.attachment)
    {
      await changeWaitStatusUser(user.PSID, true);
      waitResponse = true;
    }
    
    await sendTextAnswer(user.PSID, responsePayload[payloadIndex].response);
  }

  await changeWaitStatusUser(user.PSID, waitResponse);
  
  return waitResponse;
}

async function changeWaitStatusUser(psid, state) {
  return await mongoOxfam.DataModel.findOneAndUpdate({ "PSID": psid }, { $set: { "waitForUserResponse": state } });
}

function IsLastQuestion(count) {
  return count === dataJSON.length;
}

async function handleMessageQuiz(psid, webhookMessage) {
  // get user in the database from the psid
  let user = await mongoOxfam.DataModel.findOne({ "PSID": psid });
  let anwsered_count = user ? user.answered.count : 0;

  // if psid start conversation
  if (!user)
    user = await createUser(psid);

  // if psid continue conversation 
  else if (webhookMessage && webhookMessage.quick_reply) {
    // get bot's answer
    const waitForResponse = await answerToPayload(user, anwsered_count, webhookMessage.quick_reply.payload);
    user = await saveResult(user, webhookMessage);
    if (waitForResponse)
      return;

    // increment count only if there is no response to the quiz question // never ? 
    anwsered_count = await incrementCount(user);
  }

  // the quiz is finished ?
  if (IsLastQuestion(anwsered_count)) {
    const profil = getProfil(user);
    return sendTextAnswer(psid, createWebviewResult(profil));
  }

  // create response with quick replies
  const content = dataJSON[anwsered_count];
  const response = createQuickReplies(content);
  return sendTextAnswer(psid, response);
}

// saving profils sended by psid though payloads
async function saveResult(user, webhookMessage) {
  let profils = responseJSON[user.answered.count][webhookMessage.quick_reply.payload].profils;
  return await mongoOxfam.DataModel.findByIdAndUpdate(user._id, { $push: { "result": profils } });
}


async function createUser(psid) {
  console.log("create new user with the psid : " + psid);
  let user = new mongoOxfam.DataModel();
  user.PSID = psid;

  return await user.save();
}

async function incrementCount(user) {
  user.answered.count++;
  await user.save();
  return user.answered.count;
}

async function incrementCountPSID(psid) {
  const user = await mongoOxfam.DataModel.findOne({ "PSID": psid });
  await incrementCount(user);
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

      


async function sendTypingOn(sender_psid) {
  callSendAPIAction(sender_psid, "typing_on");
}

async function sendTypingOff(sender_psid) {
  callSendAPIAction(sender_psid, "typing_off");
}

async function sendMarkSeen(sender_psid) {
  callSendAPIAction(sender_psid, "mark_seen");
}

async function sendTextAnswer(sender_psid, response) {
  sendTypingOn(sender_psid);
  await sleep(3000);
  sendTypingOff(sender_psid);

  callSendAPIMessage(sender_psid, response);
}

async function waitReadyState(sender_psid) {
  await sendTextAnswer(sender_psid, { "text": chatJSON.stop });
  await sendTextAnswer(sender_psid, { "attachment": chatJSON.wait });
}

function createWebviewResult(profil) {
  return {
    "attachment": {
      "type": "template",
      "payload": {
        "template_type": "generic",
        "elements": [
          {
            "title": "Tu es " + resultsJSON[profil].title,
            "image_url": resultsJSON[profil].image,
            "subtitle": "Clique ici pour découvrir ton profil",
            "default_action": {
              "type": "web_url",
              "url":  process.env.PAGE_URL + "/dynamic-webview?result=" + profil,
              "messenger_extensions": true,
              "webview_height_ratio": "tall",
              "fallback_url": process.env.PAGE_URL + "/dynamic-webview?result=" + profil
            }
          }
        ]
      }
    }
  }
}

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
  if (payload == "start_quiz" )
    explanationAndStartQuiz(sender_psid, webhook_event.message);
  else if (payload == "resume")
    startQuiz(sender_psid, webhook_event.message);
  else if (payload == "reset_quiz")
    cleanQuizAndStart(sender_psid);
  else if (payload == "start_conversation")
    startConversation(sender_psid);
  else if (payload == "wait")
    pauseConversation(sender_psid);
  else
    responseAndContinueQuiz(sender_psid, payload);
}


async function explanationAndStartQuiz(sender_psid, message = null) {
  await sendTextAnswer(sender_psid, { "attachment": chatJSON.reset });
  startQuiz(sender_psid, message);
}

async function responseAndContinueQuiz(sender_psid, payload) {
  await changeWaitStatusUser(sender_psid, false);
  await sendTextAnswer(sender_psid, { "text": chatJSON[payload] });
  await incrementCountPSID(sender_psid);
  handleMessageQuiz(sender_psid);
}

async function pauseConversation(sender_psid) {
  await sendTextAnswer(sender_psid, { "attachment": chatJSON.wait });
}

async function startConversation(sender_psid) {
  await cleanQuiz(sender_psid);
  await sendTextAnswer(sender_psid, { "text": chatJSON.greetings });
  await sendTextAnswer(sender_psid, { "attachment": chatJSON.start });
}

async function startQuiz(sender_psid, message = null) {
  await sendTextAnswer(sender_psid, { "text": chatJSON.letsgo });

  handleMessageQuiz(sender_psid, message);
}

async function cleanQuiz(sender_psid) {
  return await mongoOxfam.DataModel
    .findOneAndUpdate({ "PSID": sender_psid }, { $set: { "answered.count": 2, "result": []} })
    .then((result) => resetQuestionOptions(result))
    .catch(err => console.log("error during the restart of the quizz "));
}


function cleanQuizAndStart(sender_psid) {
  cleanQuiz(sender_psid)
    .then(() => startQuiz(sender_psid))
    .catch(err => console.log("error during the restart of the quizz "));
}

function setupGetStartedButton(res){
  var messageData = {
          "get_started":
          {
              "payload":"start_conversation"
          }
  };

  // Start the request
  request({
      url: 'https://graph.facebook.com/v2.6/me/messenger_profile?access_token='+ process.env.PAGE_ACCESS_TOKEN,
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      form: messageData
  },
  function (error, response, body) {
      if (!error && response.statusCode == 200) {
          // Print out the response body
          res.send(body);

      } else { 
          // TODO: Handle errors
          res.send(body);
      }
  });
}   

function callSendAPIAction(sender_psid, action) {
  let response = {
    "recipient": {
      "id": sender_psid
    },
    "sender_action": action
  }
  // Send the HTTP request to the Messenger Platform
  request({
    "uri": "https://graph.facebook.com/v2.6/me/messages",
    "qs": { "access_token": process.env.PAGE_ACCESS_TOKEN },
    "method": "POST",
    "json": response
  }, (err, res, body) => {
    if (!err) {
      //console.log('message sent!')
      //console.dir(response);
    } else {
      console.error("Unable to send message:" + err);
    }
  });
}

function callSendAPIMessage(sender_psid, response) {

  let request_body = {
    "recipient": {
      "id": sender_psid
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

// # router region
app.set('view engine', 'pug');
app.set('views', './views');

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

app.get('/dynamic-webview', (req, res) => {
  console.log(process.env.PAGE_ACCESS_TOKEN);
  let { result } = req.query;
  result = (result) ? result : "BEN";
  console.dir(resultsJSON[result]);
  res.render('template', resultsJSON[result]);
});

app.get('/setup',function(req,res){

  setupGetStartedButton(res);
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
      res.status(404);
    }
  } 
});


app.post('/webhook', async (req, res) => {
  console.time("webhookresponse");
  console.time("webhookparse");
  const body = req.body;
  if (body.object === 'page') {

    res.status(200).send('EVENT_RECEIVED');
    console.timeEnd("webhookresponse");
    
    await body.entry.forEach(async (entry) => {


      // Gets the body of the webhook event
      const webhook_event = entry.messaging[0];
      const sender_psid = webhook_event.sender.id;

      // # debug 
      webhookDebug(webhook_event);
      // Get the sender PSID
      webhookDebug('Sender PSID: ' + sender_psid);
      console.dir('webhook event' + webhook_event);
// # debug
      // Check if the event is a message or postback and
      // pass the event to the appropriate handler function
      if (webhook_event.message) {

        // :: response to the quizz 
        if (webhook_event.message.quick_reply) {

          handleMessageQuiz(sender_psid, webhook_event.message)
            .catch(err => console.log("error during the handle of the message quiz " + err));
        }
        // :: other response
        else if (webhook_event.message.text) {
          
          const user = await mongoOxfam.DataModel.findOne({ "PSID": sender_psid });
          console.log("message : " + webhook_event.message.text);

          if (/continuer/.test(webhook_event.message.text.toLowerCase()))
            startQuiz(sender_psid, webhook_event.message);
          else if (/recommencer/.test(webhook_event.message.text.toLowerCase()))
            cleanQuizAndStart(sender_psid);
          else if (user && user.waitForUserResponse)
          {
            changeWaitStatusUser(user.PSID, false)
            .then(() =>  { sendMultipleResponse(user);});
          }
          else
            waitReadyState(sender_psid);
        }

      } else if (webhook_event.postback) {
        // :: only if restart of start quizz 
        handlePostback(sender_psid, webhook_event);
      }
    });
  console.timeEnd("webhookparse");

   // res.status(200).send('EVENT_RECEIVED');

  } else {
    res.sendStatus(404);
  }
});

app.listen(process.env.PORT || 1337, () => debug('listen to ' + process.env.PORT));

// # router end region