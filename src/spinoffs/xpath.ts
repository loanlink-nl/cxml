/*
this worked:
./node_modules/pegjs/bin/pegjs src/spinoffs/xpathParser.pegjs && tsc --allowJs src/spinoffs/xpath.ts --outDir ./ && node xpath.js 
//*/
const XPathParser = require("./XPathParser");
import { fromPairs, map, zip } from "lodash";

export type NullOrString = null | string;
export type Ops = "=" | "!=" | "&lt;" | "&lt;=" | "&gt;" | ">" | "&gt;=" | ">=";
export type PredicateRaw = null | [string[], Ops, string];
export type PredicateParsed = null | {
  left: string;
  op: Ops;
  right: string;
};
export interface ItemCommon {
  axis: string;
  namespace: string;
  name: NullOrString;
  attribute: NullOrString;
}

export interface ItemParsedPredicateRaw extends ItemCommon {
  predicates: PredicateRaw[];
}

export interface ItemParsed extends ItemCommon {
  predicates: PredicateParsed[];
}

export function parse(
  xpath: string,
  xpathNamespaceTbl: Record<string, string>,
): ItemParsed[] {
  return map(
    map(
      XPathParser.parse(xpath, {}),
      (part: [string, string, string, PredicateRaw, string]) =>
        fromPairs(
          zip(["axis", "namespace", "name", "predicates", "attribute"], part),
        ) as Record<string, any>,
      // TODO we want this to be of type ItemParsedPredicateRaw
    ),
    function (x: ItemParsedPredicateRaw) {
      const predicates = x.predicates;
      let parsedPredicates;
      if (predicates !== null) {
        const strippedPredicates = predicates.slice(1).slice(0, -1);
        parsedPredicates = map(strippedPredicates, function (predicate) {
          return {
            left: predicate[0][1],
            op: predicate[1],
            right: predicate[2],
          };
        });
      }

      const namespacePrefix = x.namespace;
      if (
        !!namespacePrefix &&
        (!xpathNamespaceTbl ||
          !xpathNamespaceTbl.hasOwnProperty(namespacePrefix))
      ) {
        throw new Error(
          `Must specify namespace table for prefix: ${namespacePrefix}`,
        );
      }

      return {
        axis: x.axis,
        // NOTE: XPathParser uses "namespace" to refer to the namespace prefix.
        // We are using "namespace" to refer to the namespace name (URI).
        namespace: !!namespacePrefix ? xpathNamespaceTbl[namespacePrefix] : "",
        name: x.name,
        predicates: parsedPredicates,
        attribute: x.attribute,
      };
    },
  );
}
