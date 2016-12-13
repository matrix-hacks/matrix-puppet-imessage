var expect = require('chai').expect;
var TR = require('../transcript-reader');
var fname = "Keyvan Fatehi on 2016-12-09 at 11.16.16.ichat";
var fpath = require('path').join(__dirname, 'fixtures', fname);

describe("transcript-reader", () => {
  var tr = TR(fpath);
  it("can read a transcript", (done) => {
    tr.getMessages().then(function(data) {
      expect(data.length).to.eq(62)
      let { hash, message, sender, date, isMe } = data[30];
      expect(hash).to.eq("34536a5fe7d29d9d3bb3c6c7de5030b2")
      expect(message).to.eq("ok dude show me")
      expect(sender).to.eq('e:keyvanfatehi@gmail.com')
      expect(date).to.eq('2016-12-09T12:21:45.000')
      expect(!isMe).to.eq(false)
      done()
    });
  });
});
