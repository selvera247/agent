import { SourceAdapter } from "./base.js";
import { fixtureCommercial, fixtureGl } from "./fixtures.js";

/** Demo / CI adapter — no network. Platform tag preserved for lineage. */
export class FixtureAdapter extends SourceAdapter {
  async testConnection() {
    return {
      ok: true,
      mode: "fixture",
      platform: this.platform,
      message: `Fixture adapter ready for ${this.platform}`,
    };
  }

  async pullCommercial() {
    return fixtureCommercial(this.platform);
  }

  async pullGlLines() {
    return fixtureGl(this.platform);
  }
}
