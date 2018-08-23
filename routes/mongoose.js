var mongoose = require('mongoose');

let uri;
uri = 'mongodb://lea:oxfam-lea-1@ds143971.mlab.com:43971/oxfam-test';
// mongodb://696595:l5WSz@p6Qf3Y.sftp.sd5.gpaas.net/oxfam';
// username: 696595
// password: l5WSz@p6Qf3Y
mongoose.connect(uri,  { useNewUrlParser: true } )
	.then(() => console.log('Connected to MongoDB ... '))
	.catch(err => console.log('Could not connect to MongoDB ...', err));

const Thread_Data = mongoose.model('thread_datas', new mongoose.Schema({
		PSID : String,
		answered : {
      count : {
        type : Number,
        set: v => Math.round(v),
        max : 9,
        min : 0,
        default : 0
      }
    }, 
    result : {
      type : Array(String), 
      enum : ['CLE', 'ALI', 'GIU', 'BEN', 'BIL', 'LIS', 'PHI'],
      uppercase : true
    },
    waitForUserResponse : {
      type : Boolean,
      default : false
    },
    waitingResponseCount : {
      type : Number,
      min : 0,
      default :0
    }
	})
	.index({ PSID: 1}, { unique: true }));


async function incrementCount(user) {
  user.answered.count++;
  await user.save();
  return user.answered.count;
}

async function incrementCountPSID ( psid ) {
  const user = await mongoOxfam.findOne ({"PSID" : psid });
  await incrementCount(user);
}

module.exports.DataModel = Thread_Data; 
module.exports.incrementCount = incrementCount; 
module.exports.incrementCountPSID = incrementCountPSID; 