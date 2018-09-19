var mongoose = require('mongoose');
require('dotenv').config();

mongoose.connect(process.env.MONGO_URL,  { useNewUrlParser: true } )
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
  const user = await Thread_Data.findOne ({"PSID" : psid });
  await incrementCount(user);
}

module.exports.DataModel = Thread_Data; 
module.exports.incrementCount = incrementCount; 
module.exports.incrementCountPSID = incrementCountPSID; 