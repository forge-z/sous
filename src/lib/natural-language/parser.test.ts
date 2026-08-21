import { describe, expect, it } from "vitest";
import { parseInventoryCommand } from "./parser";

describe("parseInventoryCommand", () => {
  it("parses English purchases", () => {
    expect(parseInventoryCommand("Bought 2 kg chicken and six tomatoes")).toEqual([
      { action: "add", item: "chicken", quantity: 2, unit: "kg" },
      { action: "add", item: "tomatoes", quantity: 6, unit: "unit" }
    ]);
  });

  it("parses qualitative consumption", () => {
    expect(parseInventoryCommand("Usei metade do frango")).toEqual([
      { action: "consume", item: "frango", quantity: null }
    ]);
  });

  it("parses empty and priority commands", () => {
    expect(parseInventoryCommand("The milk is finished")).toEqual([{ action: "mark_empty", item: "milk" }]);
    expect(parseInventoryCommand("Essa berinjela precisa ser usada logo")).toEqual([{ action: "priority", item: "berinjela", priority: "use_soon" }]);
  });
});
