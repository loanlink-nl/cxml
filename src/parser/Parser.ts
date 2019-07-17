// This file is part of cxml, copyright (c) 2016-2017 BusFaster Ltd.
// Released under the MIT license, see LICENSE.

import { pick, toPairs } from "lodash";
import * as stream from "stream";
import * as Promise from "bluebird";
import * as sax from "sax";

import { Context } from "../xml/Context";
import { Namespace } from "../xml/Namespace";
import { Rule, RuleClass, HandlerInstance } from "./Rule";
import { MemberRef } from "../xml/MemberRef";
import { State } from "./State";
import { defaultContext } from "../importer/JS";
import { parse, ItemParsed } from "../spinoffs/xpath";

export type ItemParsedKey = keyof ItemParsed;
export type ItemParsedValue = ItemParsed[ItemParsedKey];

// TODO can this type definition be improved?
/*
{
	xpathElMatcher(obj): {
 	  _before: Function,
 	  _after: Function,
		xpathElMatcher(obj): {
			_before: Function,
			_after: Function,
		}(Map),
	}(Map)
}(Map)
//*/
export type AttachmentMethodNames = "_after" | "_before";
export type BTreeFinal = Map<AttachmentMethodNames, Function>;
export type BTreeIntermediate<T> = Map<ItemParsed, T | BTreeFinal>;
export type BTree<T> = BTreeIntermediate<T> & BTreeFinal;

export interface CxmlDate extends Date {
  cxmlTimezoneOffset: number;
}

function findInMapIter<T>(
  // TODO why can't I mark this as BTree<T> instead of any?
  mapIter: Iterator<[ItemParsed, any]>,
  compare: (x: ItemParsed) => boolean
): BTree<T> {
  const { value, done } = mapIter.next();
  if (!value) {
    return;
  }
  const [itemParsed, childMap] = value;
  if (!compare(itemParsed)) {
    if (done) {
      return;
    }
    return findInMapIter<T>(mapIter, compare);
  } else {
    return childMap;
  }
}

export type NonBinaryOpToRights = { [K in "=" | "!="]: string | number };
export type BinaryOpToRights = {
  [K in "&lt;" | "&lt;=" | "&gt;" | ">" | "&gt;=" | ">="]: number
};
// TODO look at moving some of these type definitions into xpath.ts
export type OpToRights = NonBinaryOpToRights & BinaryOpToRights;
export type OpHandlerInputGeneric<T, K extends keyof T> = {
  left: string;
  op: K;
  right: T[K];
};
export type OpHandlerInput = OpHandlerInputGeneric<
  OpToRights,
  keyof OpToRights
>;
export type OpHandlersGeneric<T, K extends keyof T> = {
  [K: string]: (item: HandlerInstance, left: string, right: T[K]) => boolean;
};
export type OpHandlers = OpHandlersGeneric<OpToRights, keyof OpToRights>;

let opHandlers = {
  // equal
  "=": function(item, left, right) {
    return item[left] === right;
  },
  // not equal
  "!=": function(item, left, right) {
    return item[left] !== right;
  },
  // less than
  "&lt;": function(item, left, right) {
    return item[left] < right;
  },
  // less than or equal to
  "&lt;=": function(item, left, right) {
    return item[left] < right;
  },
  // greater than
  "&gt;": function(item, left, right) {
    return item[left] > right;
  },
  // greater than or equal to
  "&gt;=": function(item, left, right) {
    return item[left] > right;
  }
} as OpHandlers;

opHandlers[">"] = opHandlers["&gt;"];
opHandlers[">="] = opHandlers["&gt;="];

/*
opHandlers["&gt;"]({} as HandlerInstance, "CenterX", 2);
opHandlers["&gt;"]({} as HandlerInstance, "CenterX", "b");
opHandlers["&gt;"]({} as HandlerInstance, "a", "b");
opHandlers[">"]({} as HandlerInstance, "CenterX", 2);
opHandlers[">"]({} as HandlerInstance, "a", 2);
opHandlers[">="]({} as HandlerInstance, 1, 2);
opHandlers[">="]({} as HandlerInstance, "a", 2);
opHandlers["="]({} as HandlerInstance, "a", 2);
//*/

function findEntry<T>(
  mapIter: Iterator<[ItemParsed, BTree<T>]>,
  compare: (x: ItemParsed) => boolean
): [BTree<T>, ItemParsed] {
  const { value, done } = mapIter.next();
  if (!value) {
    return;
  }
  const [itemParsed, childMap] = value;
  if (!compare(itemParsed)) {
    if (done) {
      return;
    }
    return findEntry(mapIter, compare);
  } else {
    return [childMap, itemParsed];
  }
}

function getAttachmentMethod<T>(
  state: State,
  bTree: BTree<T>,
  attachmentMethodName: AttachmentMethodNames
): Function {
  const member =
    (!!state.memberRef && state.memberRef.member) ||
    ({} as typeof MemberRef.prototype.member);
  // TODO should we use state.memberRef.safeName here?
  const memberName = !!member && member.name;
  const memberNamespace =
    !!member && !!member.namespace && member.namespace.name;

  if (!memberName) {
    const attachmentMethod = bTree.get(attachmentMethodName);
    if (attachmentMethod) {
      return attachmentMethod;
    } else {
      throw new Error(
        `getAttachmentMethod failed to find ${attachmentMethodName} function`
      );
    }
  }
  const item = state.item || ({} as HandlerInstance);

  /*{ left: string; op: keyof NonBinaryOpHandlers; right: string }
            { left: number; op: keyof BinaryOpHandlers; right: number }
            | {
                left: string | number;
                op: keyof NonBinaryOpHandlers;
                right: string | number;
              }
							//*/

  const value = findInMapIter(bTree.entries(), function({
    axis,
    namespace,
    name,
    predicates,
    attribute
  }: ItemParsed) {
    return (
      ["", memberNamespace].indexOf(namespace) > -1 &&
      name === memberName &&
      (!predicates ||
        predicates.reduce(function(acc, { left, op, right }: OpHandlerInput) {
          return acc && opHandlers[op](item, left, right);
        }, true))
    );
  });

  if (!value) {
    // NOTE: we can end up here because there is no direct connection between
    // a Parser instance's attach and _parse methods. They actually just
    // connect via the rule.handler prototype. So it's possible for one
    // attachment method to set something on the rule.handler prototype, meaning it
    // appears to exist when we look at item._before or item._after in _parser,
    // but it doesn't actually exist for this xpath when we match the
    // state and bTree, level by level, up to the point where there should be
    // a _before or _after.
    return;
  }

  const parent = state.parent;
  if (!!parent) {
    return getAttachmentMethod(parent, value, attachmentMethodName);
  } else {
    return value.get(attachmentMethodName);
  }
}

const converterTbl: { [type: string]: (item: string) => any } = {
  Date: (item: string) => {
    const dateParts = item.match(
      /([0-9]+)-([0-9]+)-([0-9]+)(?:T([0-9]+):([0-9]+):([0-9]+)(\.[0-9]+)?)?(?:Z|([+-][0-9]+):([0-9]+))?/
    );

    if (!dateParts) return null;

    let offsetMinutes = +(dateParts[9] || "0");
    let offset = +(dateParts[8] || "0") * 60;

    if (offset < 0) offsetMinutes = -offsetMinutes;

    offset += offsetMinutes;

    const date = new Date(
      +dateParts[1],
      +dateParts[2] - 1,
      +dateParts[3],
      +(dateParts[4] || "0"),
      +(dateParts[5] || "0"),
      +(dateParts[6] || "0"),
      +(dateParts[7] || "0") * 1000
    ) as CxmlDate;

    date.setTime(date.getTime() - (offset + date.getTimezoneOffset()) * 60000);
    date.cxmlTimezoneOffset = offset;

    return date;
  },
  boolean: (item: string) => item == "true",
  string: (item: string) => item,
  number: (item: string) => +item
};

function convertPrimitive(text: string, type: Rule) {
  const converter = converterTbl[type.primitiveType];

  if (converter) {
    if (type.isList) {
      return text
        .trim()
        .split(/\s+/)
        .map(converter);
    } else {
      return converter(text.trim());
    }
  }

  return null;
}

export class Parser<T> {
  xpathNamespaceTbl: Record<string, string>;
  constructor(xpathNamespaceTbl: Record<string, string> = { "": "" }) {
    // TODO there is probably a better way to do this.
    // It appears the context param in the parser.parser
    // method may have be intended for the same purpose.
    this.xpathNamespaceTbl = xpathNamespaceTbl;
  }
  // TODO why do I need to use BTree<any> here?
  // I should be able to use BTree<T>
  bTree: BTree<any> & BTree<T> = new Map();
  attach<CustomHandler extends HandlerInstance>(
    handler: {
      new (): CustomHandler;
    },
    xpath: string
  ) {
    const { xpathNamespaceTbl } = this;
    const proto = handler.prototype as CustomHandler;
    const realHandler = (handler as RuleClass).rule.handler;
    const realProto = realHandler.prototype as CustomHandler;

    type CustomHandlerKey = keyof CustomHandler;
    const customHandlerKeys: CustomHandlerKey[] = Object.keys(proto);

    for (const customHandlerKey of customHandlerKeys) {
      const timeBasedKeys: CustomHandlerKey[] = ["_before", "_after"];
      if (timeBasedKeys.indexOf(customHandlerKey) === -1) {
        realProto[customHandlerKey] = proto[customHandlerKey];
      }
    }

    // TODO is this really the best way to do this?
    const { _before, _after } = proto;
    if (xpath) {
      if (_before || _after) {
        // TODO we are mutating reversedXPathElMatchers for xpath
        // expressions with attributes, such as
        // "/Pathway/@GraphId"
        // or
        // "/Pathway/@*"
        // because we need to first just match the element(s), and
        // then afterwards match any attribute.
        let reversedXPathElMatchers = parse(xpath, xpathNamespaceTbl).reverse();
        let xpathAttrMatcher: { attribute: string };
        if (reversedXPathElMatchers[0].attribute !== null) {
          xpathAttrMatcher = reversedXPathElMatchers.shift();
        }
        const finalItem = reversedXPathElMatchers.reduce(function(
          parentMap,
          xpathElMatcher: ItemParsed
        ) {
          const xpathElMatcherPairs = toPairs(xpathElMatcher);
          let [currentMap, currentItemParsed]: [
            BTree<T>,
            ItemParsed
          ] = findEntry(parentMap.entries(), function(candidateItemParsed) {
            return xpathElMatcherPairs.reduce(function(
              isRunningMatch: boolean,
              [xpathElMatcherKey, xpathElMatcherValue]: [
                ItemParsedKey,
                ItemParsedValue
              ]
            ) {
              return (
                isRunningMatch &&
                candidateItemParsed[xpathElMatcherKey] === xpathElMatcherValue
              );
            },
            true);
          }) || [new Map(), xpathElMatcher];
          parentMap.set(currentItemParsed, currentMap);
          return currentMap;
        },
        this.bTree);

        if (_before) {
          finalItem.set(
            "_before",
            !xpathAttrMatcher || xpathAttrMatcher.attribute === "*"
              ? _before
              : function(this: Map<string, string | number | boolean | "">) {
                  const picked = pick(this, xpathAttrMatcher.attribute);
                  _before.call(picked);
                }
          );
        }
        if (_after) {
          finalItem.set("_after", _after);
        }
      }
    }

    realHandler._custom = true;
  }

  parse<Output extends HandlerInstance>(
    stream: string | stream.Readable | NodeJS.ReadableStream,
    output: Output,
    context?: Context
  ) {
    return new Promise<Output>(
      (resolve: (item: Output) => void, reject: (err: Error) => void) =>
        this._parse<Output>(
          stream,
          output,
          context || defaultContext,
          resolve,
          reject
        )
    );
  }

  _parse<Output extends HandlerInstance>(
    stream: string | stream.Readable | NodeJS.ReadableStream,
    output: Output,
    context: Context,
    resolve: (item: Output) => void,
    reject: (err: Error) => void
  ) {
    const { bTree } = this;
    const xml = sax.createStream(true, { position: true });
    let rule = (output.constructor as RuleClass).rule;
    const xmlSpace = context.registerNamespace(
      "http://www.w3.org/XML/1998/namespace"
    );

    let namespaceTbl: { [short: string]: [Namespace, string] } = {
      "": [rule.namespace, rule.namespace.getPrefix()],
      xml: [xmlSpace, xmlSpace.getPrefix()]
    };

    let state = new State(null, null, rule, new rule.handler(), namespaceTbl);
    const rootState = state;
    let parentItem: HandlerInstance;

    /** Add a new xmlns prefix recognized inside current tag and its children. */

    function addNamespace(short: string, namespace: Namespace) {
      if (namespaceTbl[short] && namespaceTbl[short][0] == namespace) return;

      if (namespaceTbl == state.namespaceTbl) {
        // Copy parent namespace table on first write.
        namespaceTbl = {};

        for (let key of Object.keys(state.namespaceTbl)) {
          namespaceTbl[key] = state.namespaceTbl[key];
        }
      }

      namespaceTbl[short] = [namespace, namespace.getPrefix()];
    }

    xml.on("opentag", (node: sax.Tag) => {
      const attrTbl = node.attributes;
      let attr: string;
      let nodePrefix = "";
      let name = node.name;
      let splitter = name.indexOf(":");
      let item: HandlerInstance = null;

      namespaceTbl = state.namespaceTbl;

      // Read xmlns namespace prefix definitions before parsing node name.

      for (const key of Object.keys(attrTbl)) {
        if (key.substr(0, 5) == "xmlns") {
          const nsParts = key.match(/^xmlns(:(.+))?$/);

          if (nsParts) {
            addNamespace(
              nsParts[2] || "",
              context.registerNamespace(attrTbl[key])
            );
          }
        }
      }

      // Parse node name and possible namespace prefix.

      if (splitter >= 0) {
        nodePrefix = name.substr(0, splitter);
        name = name.substr(splitter + 1);
      }

      // Add internal surrogate key namespace prefix to node name.

      const nodeNamespace = namespaceTbl[nodePrefix];
      name = nodeNamespace[1] + name;

      let child: MemberRef;
      let rule: Rule;

      if (state.rule) {
        child = state.rule.childTbl[name];

        if (child) {
          if (child.proxy) {
            rule = child.proxy.member.rule;
            state = new State(
              state,
              child.proxy,
              rule,
              new rule.handler(),
              namespaceTbl
            );
          }

          rule = child.member.rule;
        }
      }

      if (rule && !rule.isPlainPrimitive) {
        item = new rule.handler();

        // Parse all attributes.

        for (const key of Object.keys(attrTbl)) {
          splitter = key.indexOf(":");

          if (splitter >= 0) {
            const attrPrefix = key.substr(0, splitter);
            if (attrPrefix == "xmlns") continue;

            const attrNamespace = namespaceTbl[attrPrefix];

            if (attrNamespace) {
              attr = attrNamespace[1] + key.substr(splitter + 1);
            } else {
              console.warn("Namespace not found for " + key);
              continue;
            }
          } else {
            attr = nodeNamespace[1] + key;
          }

          const ref = rule.attributeTbl[attr];

          if (ref && ref.member.rule.isPlainPrimitive) {
            item[ref.safeName] = convertPrimitive(
              attrTbl[key],
              ref.member.rule
            );
          }
        }

        if (state.parent) {
          Object.defineProperty(item, "_parent", {
            enumerable: false,
            value: state.parent.item
          });
        }

        Object.defineProperty(item, "_name", {
          enumerable: false,
          value: node.name
        });
      }

      state = new State(state, child, rule, item, namespaceTbl);
      // TODO why did the previous version of this lib check
      // (rule && !rule.isPlainPrimitive) before running _before?
      // I'm keeping the check for now, until I figure out why.
      // TODO also, why did it run '_before' prior to re-setting state
      // (re-setting in the line above)?
      if (rule && !rule.isPlainPrimitive) {
        const thisBefore = getAttachmentMethod(state, bTree, "_before");
        if (!!thisBefore) {
          thisBefore.call(item);
        }
      }
    });

    xml.on("text", function(text: string) {
      if (state.rule && state.rule.isPrimitive) {
        if (!state.textList) state.textList = [];
        state.textList.push(text);
      }
    });

    xml.on("closetag", function(name: string) {
      let member = state.memberRef;
      const obj = state.item;
      let item: HandlerInstance = obj;
      let text: string;

      if (state.rule && state.rule.isPrimitive) {
        text = (state.textList || []).join("").trim();
      }

      if (text) {
        const content = convertPrimitive(text, state.rule);

        if (state.rule.isPlainPrimitive) {
          item = content;
        } else {
          obj.content = content;
        }
      }

      if (obj) {
        const thisAfter = getAttachmentMethod(state, bTree, "_after");
        if (!!thisAfter) {
          thisAfter.call(obj);
        }
      }

      state = state.parent;

      if (member && member.proxy) {
        if (item) state.item[member.safeName] = item;
        item = state.item;

        state = state.parent;
        member = member.proxy;
      }

      if (item) {
        let parent = state.item;

        if (parent) {
          if (member.max > 1) {
            if (!parent.hasOwnProperty(member.safeName)) {
              parent[member.safeName] = [];
            }
            parent[member.safeName].push(item);
          } else {
            parent[member.safeName] = item;
          }
        }
      }
    });

    xml.on("end", function() {
      resolve((rootState.item as HandlerInstance) as Output);
    });

    xml.on("error", function(err: Error) {
      console.error(err);
    });

    if (typeof stream == "string") {
      xml.write(stream as string);
      xml.end();
    } else (stream as stream.Readable).pipe(xml);
  }
}
