import test from "node:test";
import assert from "node:assert/strict";
import { mapCompanyMaster } from "./policycraft-mapping";

test("maps policy-relevant organization and active site fields", () => {
  const result = mapCompanyMaster({
    id: 7,
    org_code: "ORG-7",
    company_name: "Example Industries",
    address: "Registered address",
    country: "India",
    city: "Surat",
    website: "https://example.test",
    sector: "Manufacturing",
    sub_sector: "Chemicals",
  }, [{ id: 11, site_code: "SITE-11", name: "Main plant", address: "Plant address", type: "Manufacturing" }]);

  assert.equal(result.name, "Example Industries");
  assert.equal(result.industry, "Manufacturing");
  assert.equal(result.subCategory, "Chemicals");
  assert.deepEqual(result.sites, [{ id: "11", location: "Main plant", address: "Plant address", primaryFunction: "Manufacturing" }]);
});

test("preserves blanks and uses organization address only when no sites exist", () => {
  const result = mapCompanyMaster({
    id: 8,
    org_code: "ORG-8",
    company_name: "Blank Sector Co",
    address: "Office address",
    country: "India",
    city: "Pune",
    website: "",
    sector: null,
    sub_sector: null,
  }, []);

  assert.equal(result.industry, "");
  assert.equal(result.subCategory, "");
  assert.deepEqual(result.sites, [{ id: "organization-address", location: "Pune", address: "Office address", primaryFunction: "" }]);
});

