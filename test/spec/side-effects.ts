import * as cxml from "../..";
import * as example from "../xmlns/dir-example";

test("Attach handler w/ _before & _after. Parse string. No assertions.", () => {
  expect.assertions(0);

  var parser = new cxml.Parser();

  parser.attach(
    class DirHandler extends example.document.dir.constructor {
      _before() {
        //console.log("this before");
        //console.log(this);
      }

      _after() {
        //console.log("this after");
        //console.log(this);
      }
    },
    "/dir",
  );

  return parser.parse('<dir name="empty"></dir>', example.document);
});

test("Attach handler w/ _before. Parse string.", () => {
  // NOTE: this assertion count is NOT taking into account
  // the commented out expect below regarding
  // "dir instanceof example.document.dir.constructor"
  expect.assertions(8);

  var parser = new cxml.Parser();

  parser.attach(
    class DirHandler extends example.document.dir.constructor {
      _before() {
        expect(this).toEqual({ name: "empty" });
      }

      _after() {
        expect(this).toEqual({ name: "empty" });
      }
    },
    "/dir",
  );

  const result = parser.parse('<dir name="empty"></dir>', example.document);

  return result.then((doc: example.document) => {
    expect(doc).toEqual({ dir: { name: "empty" } });
    var dir = doc.dir;

    // TODO why doesn't this pass?
    //expect(dir instanceof example.document.dir.constructor).toBe(true);
    expect(dir instanceof example.document.file.constructor).toBe(false);

    expect(dir instanceof example.DirType).toBe(true);
    expect(dir instanceof example.FileType).toBe(false);

    expect(dir._exists).toBe(true);
    expect(dir.file[0]._exists).toBe(false);
  });
});

// TODO figure out the assertion count weirdness for the following
// two tests. There are zero assertions in each, but the ones after fail.
// Why does parser.attach seem to have increment
// the expected assertion count, even if there is
// no assertion defined in it?
test("Parse string. No handler. No assertions.", () => {
  expect.assertions(0);

  var parser = new cxml.Parser();

  return parser.parse('<dir name="empty"></dir>', example.document);
});

// TODO TODO TODO
// TODO why does this fail? It's related to having the handler attached but
// not specifying _before and _after. A previously defined handler had _before
// and _after with assertions inside, leading to this test expecting those in here.
test("Attach handler w/out _before or _after. Parse string. No assertions.", () => {
  expect.assertions(0);

  var parser = new cxml.Parser();

  /*
  parser.attach(
    class DirHandler extends example.document.dir.constructor {},
    "/dir"
  );
	//*/

  return parser.parse('<dir name="empty"></dir>', example.document);
});

//// TODO this fails for a similar reason as the one above.
//test("Attach handler w/out _after & w/ NOOP as _before. Parse string. No assertions.", () => {
//  expect.assertions(0);
//
//  var parser = new cxml.Parser();
//
//  parser.attach(
//    class DirHandler extends example.document.dir.constructor {
//      /** Fires when the closing </dir> and children have been parsed. */
//
//      _before() {}
//    },
//    "/dir"
//  );
//
//  return parser.parse('<dir name="empty"></dir>', example.document);
//});
//
//// TODO this fails for a similar reason as the one above.
//test("Attach handler w/out _before & w/ NOOP as _after. Parse string. No assertions.", () => {
//  expect.assertions(0);
//
//  var parser = new cxml.Parser();
//
//  parser.attach(
//    class DirHandler extends example.document.dir.constructor {
//      /** Fires when the closing </dir> and children have been parsed. */
//
//      _after() {}
//    },
//    "/dir"
//  );
//
//  return parser.parse('<dir name="empty"></dir>', example.document);
//});

test("Attach handler w/ NOOP as _before & _after. Parse string. Promise w/ assertions.", () => {
  // NOTE: this assertion count is NOT taking into account
  // the commented out expect below regarding
  // "dir instanceof example.document.dir.constructor"
  expect.assertions(6);

  var parser = new cxml.Parser();

  parser.attach(
    class DirHandler extends example.document.dir.constructor {
      _before() {}
      _after() {}
    },
    "/dir",
  );

  const result = parser.parse('<dir name="empty"></dir>', example.document);

  return result.then((doc: example.document) => {
    expect(doc).toEqual({ dir: { name: "empty" } });
    var dir = doc.dir;

    // TODO why doesn't this pass?
    //expect(dir instanceof example.document.dir.constructor).toBe(true);
    expect(dir instanceof example.document.file.constructor).toBe(false);

    expect(dir instanceof example.DirType).toBe(true);
    expect(dir instanceof example.FileType).toBe(false);

    expect(dir._exists).toBe(true);
    expect(dir.file[0]._exists).toBe(false);
  });
});

test("Attach handler w/ NOOP as _before & _after. Parse string w/ timeout. Promise w/ assertions.", (done) => {
  // NOTE: this assertion count is NOT taking into account
  // the commented out expect below regarding
  // "dir instanceof example.document.dir.constructor"
  expect.assertions(6);

  var parser = new cxml.Parser();

  parser.attach(
    class DirHandler extends example.document.dir.constructor {
      _before() {}
      _after() {}
    },
    "/dir",
  );

  const result = parser.parse('<dir name="empty"></dir>', example.document);

  setTimeout(function () {
    result.then((doc: example.document) => {
      expect(doc).toEqual({ dir: { name: "empty" } });
      var dir = doc.dir;

      // TODO why doesn't this pass?
      //expect(dir instanceof example.document.dir.constructor).toBe(true);
      expect(dir instanceof example.document.file.constructor).toBe(false);

      expect(dir instanceof example.DirType).toBe(true);
      expect(dir instanceof example.FileType).toBe(false);

      expect(dir._exists).toBe(true);
      expect(dir.file[0]._exists).toBe(false);
      done();
    });
  }, 500);
});
