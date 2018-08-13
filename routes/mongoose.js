var mongoose = require('mongoose');

let uri;
// uri = 'mongodb://lea:oxfam-lea-1@ds143971.mlab.com:43971/oxfam-test';
uri=process.env.MONGO_URL;
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


module.exports = Thread_Data; 