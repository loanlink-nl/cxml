// This file is part of cxml, copyright (c) 2016 BusFaster Ltd.
// Released under the MIT license, see LICENSE.

import "source-map-support/register";

export { ContextBase } from "./xml/ContextBase.js"
export { NamespaceBase } from "./xml/NamespaceBase.js"
export { TypeSpec, TypeFlag } from "./xml/TypeSpec.js"
export { MemberSpec, MemberFlag } from "./xml/MemberSpec.js"
export { MemberRef, MemberRefFlag } from "./xml/MemberRef.js"
export { Parser } from "./parser/Parser.js"

export { init, register, defaultContext } from "./importer/JS.js"
