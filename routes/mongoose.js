var mongoose = require('mongoose');

let uri;
uri = 'mongodb://lea:oxfam-lea-1@ds143971.mlab.com:43971/oxfam-test';

mongoose.connect(uri,  { useNewUrlParser: true } )
	.then(() => console.log('Connected to MongoDB ... '))
	.catch(err => console.log('Could not connect to MongoDB ...', err));

const Thread_Data = mongoose.model('thread_datas', new mongoose.Schema({
		PSID : String,
		answered : {
       status : {
         type : String, 
         enum : ['completed', 'wip', 'not started'],
         lowercase : true,
         default : 'not started'
       }, 
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
    }
	})
	.index({ PSID: 1}, { unique: true }));


module.exports = Thread_Data; 