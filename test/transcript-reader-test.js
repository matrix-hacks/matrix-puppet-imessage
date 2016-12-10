var expect = require('chai').expect;
var TR = require('../transcript-reader');
var fname = "Keyvan Fatehi on 2016-12-09 at 11.16.16.ichat";
var fpath = require('path').join(__dirname, 'fixtures', fname);

describe("transcript-reader", () => {
  var tr = TR(fpath);
  it("can read a transcript", (done) => {
    tr.getMessages().then(function(data) {
      console.log(data);
      done()
    });
  });
});
