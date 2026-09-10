import type { StackNode } from "~/types/node";
import {
  convertToPure,
  convertToStack,
  type StackImportOptions,
} from "~/lib/convert";

export const nodesToString = (nodes: readonly StackNode[]): string =>
  JSON.stringify(convertToPure([...nodes]), null, 2);

export const stringToNodes = (
  text: string,
  options: StackImportOptions = {},
): StackNode[] =>
  convertToStack(
    JSON.parse(text) as Parameters<typeof convertToStack>[0],
    options,
  );
