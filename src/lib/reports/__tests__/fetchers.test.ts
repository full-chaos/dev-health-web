import { describe, it, expect } from "vitest";
import { fetchSavedReports, fetchSavedReport, fetchReportRuns } from "../fetchers";
import { sampleReports, sampleRuns } from "../sample-data";

describe("Report Fetchers", () => {
    it("fetchSavedReports returns sample data when isTestMode is true", async () => {
        const result = await fetchSavedReports("default-org", undefined, undefined, true);
        expect(result.items).toEqual(sampleReports);
        expect(result.total).toEqual(sampleReports.length);
    });

    it("fetchSavedReport returns sample data when isTestMode is true", async () => {
        const reportId = sampleReports[0].id;
        const result = await fetchSavedReport("default-org", reportId, true);
        expect(result).toEqual(sampleReports[0]);
    });

    it("fetchReportRuns returns sample data when isTestMode is true", async () => {
        const reportId = sampleReports[0].id;
        const result = await fetchReportRuns("default-org", reportId, undefined, true);
        expect(result.items).toEqual(sampleRuns[reportId] || []);
    });
});
