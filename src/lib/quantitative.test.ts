import assert from "node:assert/strict";
import test from "node:test";
import { syncQuantitativeAreas } from "./quantitative";

test("new quantitative focus areas start without placeholder target rows", () => {
  const areas = syncQuantitativeAreas([], ["Supplier Code of Conduct", "Supplier Due Diligence"]);

  assert.deepEqual(areas, [
    { area: "Supplier Code of Conduct", targets: [] },
    { area: "Supplier Due Diligence", targets: [] },
  ]);
});
