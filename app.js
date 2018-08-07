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
const emojiJSON = require("emoji-datasource-messenger/emoji.json");
const testemoji = require("emoji-data");
const responseJSON = require("./public/response.json");
const zero = testemoji.from_unified("0030-FE0F-20E3");
const est = testemoji.find_by_short_name(":zero:");//app); 
// :: Dependencies in the personal code

// wait fo the answer for the response of payload 
// answerToPayload()

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
  let {result} = req.query;
  result = (result ) ? result : "BEN";
  console.log(result);
  res.render('template', resultsJSON[result]);
});

function sleep(ms){
  return new Promise(resolve=>{
      setTimeout(resolve,ms)
  });
}

async function sendMultipleResponse(user) {
  if ( user.waitingResponseCount < responseJSON[user.waitingResponseCount].master_response.length) {
    await sendTextAnswer(user.PSID, responseJSON[user.awaitingResponseCount].master_response[user.waitingResponseCount]);
    user.waitingResponseCount++;
    return await user.save();
  }
  else {
    user.waitingResponseCount = 0;
    user.waitForUserResponse = false;
    await user.save();
    handleMessageQuiz(user.PSID);
  }
}

async function answerToPayload(user, questionIndex, payloadIndex ) {
  const responsePayload = responseJSON[questionIndex];
  // one response for all the payload
  if ( responsePayload.master_response ) 
  {
    // if there is more than one sentence, wait that the user answer between them
    if ( responsePayload.master_response.length > 0 ) 
      await changeWaitStatusUser(user.PSID, true);
    // bot send text answer 
    await sendMultipleResponse(user);
     //sendTextAnswer(user, responsePayload.master_response[0]);
  } else {
    if ( responsePayload[payloadIndex].response.attachment )
      await changeWaitStatusUser(user.PSID, true);
      
     await sendTextAnswer(user.PSID, responsePayload[payloadIndex].response);
  }
  return user.waitForUserResponse;
}

async function changeWaitStatusUser(psid, state){
   let user = await mongoOxfam.findOneAndUpdate ({"PSID" : psid }, { $set : { "waitForUserResponse" : state } });
   await user.save();
}

function IsLastQuestion(count)
{
    return count === dataJSON.length;
}

async function handleMessageQuiz(psid, webhookMessage) {
  // get user in the database from the psid
  let user = await mongoOxfam.findOne({ "PSID": psid });

  // if psid start conversation
  if (!user)
    user = await createUser(psid);

  // if psid continue conversation 
  else if ( webhookMessage && webhookMessage.quick_reply ) {
    // get bot's answer
    const waitForResponse = await answerToPayload(user, anwsered_count, webhookMessage.quick_reply.payload);
    user = await saveResult(user, webhookMessage);
    if ( waitForResponse )
      return;
  }

  anwsered_count = await incrementCount(user);

  // the quiz is finished ?
  if (IsLastQuestion(anwsered_count)) {
    const profil = getProfil(user);
    return createWebviewResult(profil);
  }

  // create response with quick replies
    const content = dataJSON[anwsered_count];
    const response = createQuickReplies(content);
    callSendAPI(psid, response);
}

  // saving profils sended by psid though payloads
async function saveResult(user, webhookMessage ) {
  let profils = responseJSON[user.answered.count][webhookMessage.quick_reply.payload].profils; 
  await mongoOxfam.findByIdAndUpdate(user._id, { $push: { "result": profils } });
}


async function createUser(psid) {
  console.log("create new user with the psid : " + psid);
  let user = new mongoOxfam();
  user.PSID = psid;

  return await user.save();
}

async function incrementCount(user) {
  user.answered.count++;
  await user.save();
  return user.answered.count;
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


app.post('/webhook', async (req, res) => {
  const body = req.body;
  if (body.object === 'page') {

    await body.entry.forEach(async (entry) =>  {

   
      // Gets the body of the webhook event
      const webhook_event = entry.messaging[0];
      const  sender_psid = webhook_event.sender.id;
      const user = await mongoOxfam.findOne({"PSID" : sender_psid});
     webhookDebug(webhook_event);

      // Get the sender PSID
      webhookDebug('Sender PSID: ' + sender_psid);
      sendMarkSeen(sender_psid);
        console.dir('webhook event' + webhook_event);

      // Check if the event is a message or postback and
      // pass the event to the appropriate handler function
      if (webhook_event.message) {
       
        if ( webhook_event.message.quick_reply ) {
          sendTypingOn(sender_psid);
          
          handleMessageQuiz(sender_psid, webhook_event.message)
          .catch(err => console.log("error during the handle of the message quiz "));
        } 
        else if (webhook_event.message.text) {
          console.log("message : " + webhook_event.message.text);
         if (/continuer/.test(webhook_event.message.text.toLowerCase()))
          startQuiz(sender_psid, webhook_event.message);
         else if (/recommencer/.test(webhook_event.message.text.toLowerCase()))
            restartQuiz(sender_psid);
        else if ( user.waitForUserResponse ) 
          sendMultipleResponse(user);
        else 
          waitReadyState(sender_psid);
        }
        
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

async function sendTextAnswer( sender_psid, response ) {
  sendTypingOn(sender_psid);
  await sleep(2000);
  sendTypingOff(sender_psid);

  callSendAPI(sender_psid, response);
}

async function waitReadyState(sender_psid ) {
  await sendTextAnswer(sender_psid, {"text": chatJSON.stop });
  await sendTextAnswer(sender_psid, {"attachment": chatJSON.wait });
}

function createWebviewResult ( profil ) {
    return {
      "attachment":{
      "type":"template",
      "payload":{
        "template_type":"generic",
        "elements":[
           {
            "title":"Voici ton résultat !",
           "image_url":"https://petersfancybrownhats.com/company_image.png",
            "subtitle":"Clique sur ce lien pour savoir quel cousin Oxfam tu es !",
            "default_action": {
              "type": "web_url",
              "url": "https://bubble-message.glitch.me/dynamic-webview?result="+ profil,
              "messenger_extensions": true,
              "webview_height_ratio": "tall",
              "fallback_url": "https://bubble-message.glitch.me/dynamic-webview?result="+ profil
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
  if (payload == "start_quiz" || payload == "resume" )
    startQuiz(sender_psid, webhook_event.message);
  else if (payload == "reset_quiz")
    restartQuiz(sender_psid);
  else if ( payload == "start_conversation")
    startConversation(sender_psid);
  else if ( payload == "wait" ) 
    pauseConversation(sender_psid);
  else 
    responseAndContinueQuiz(sender_psid, payload );
 /* else if ( payload == "yes_protest" ) 
    sendTextAnswer(sender_psid, { "text": chatJSON.yes_protest });
    else if (payload == "no_protest")
    sendTextAnswer(sender_psid, { "text": chatJSON.no_protest });*/
      
}

function responseAndContinueQuiz(sender_psid, payload)
{
    changeWaitStatusUser(sender_psid,false);
    sendTextAnswer(sender_psid, { "text": chatJSON[payload] });
    handleMessageQuiz(sender_psid);
}

async function pauseConversation (sender_psid ) {
  await sendTextAnswer(sender_psid, { "attachment": chatJSON.wait });
}
  
async function startConversation(sender_psid) {
  await sendTextAnswer(sender_psid, { "text": chatJSON.greetings });
  await sendTextAnswer(sender_psid, { "attachment": chatJSON.reset });
  await sendTextAnswer(sender_psid, { "attachment": chatJSON.start });
}

async function startQuiz(sender_psid, message = null) {
  await sendTextAnswer(sender_psid, { "text": chatJSON.letsgo });
  
  handleMessageQuiz(sender_psid, message);
}

function restartQuiz(sender_psid) {
  mongoOxfam
    .findOneAndUpdate ({"PSID" : sender_psid }, { $set: { "answered.count": 0 , "result" : [], "waitForUserResponse" : false } })
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
      //console.log('message sent!')
      //console.dir(response);
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

