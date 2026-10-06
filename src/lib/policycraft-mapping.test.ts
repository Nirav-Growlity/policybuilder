import test from "node:test";
import assert from "node:assert/strict";
import { applyCompanyMaster, mapCompanyMaster } from "./policycraft-mapping";
import { initialPolicy } from "./initial-policy";

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
    industry: "Organic chemicals",
  }, [{ id: 11, site_code: "SITE-11", name: "Main plant", address: "Plant address", type: "Manufacturing" }]);

  assert.equal(result.name, "Example Industries");
  assert.equal(result.industry, "Manufacturing");
  assert.equal(result.subCategory, "Chemicals");
  assert.equal(result.industryDetail, "Organic chemicals");
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
    industry: null,
  }, []);

  assert.equal(result.industry, "");
  assert.equal(result.subCategory, "");
  assert.equal(result.industryDetail, "");
  assert.deepEqual(result.sites, [{ id: "organization-address", location: "Pune", address: "Office address", primaryFunction: "" }]);
});

test("applies the actual industry while retaining legacy sector and subsector fields", () => {
  const company = applyCompanyMaster(initialPolicy("environmental"), {
    id: 9, code: "ORG-9", name: "Example Co", industry: "Manufacturing", subCategory: "Chemicals",
    industryDetail: "Industrial gases", country: "India", websiteLink: "", address: "", city: "", sites: [],
  }).company;

  assert.equal(company.industry, "Manufacturing");
  assert.equal(company.subCategory, "Chemicals");
  assert.equal(company.industryDetail, "Industrial gases");
});

