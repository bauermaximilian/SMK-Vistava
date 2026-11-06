// SPDX-License-Identifier: GPL-3.0-or-later

import { Dialog } from "../../Dependencies/vistava.js/src/Components/Dialog/Dialog.js";
import { RateLimiter } from "../../Dependencies/vistava.js/src/Shared/RateLimiter.js";
import { SourceSegmented, SourceSegmentedContentRetriever } from "../../Dependencies/vistava.js/src/Shared/SourceSegmented.js";

/**
 * @typedef {object} SourceSMKConfiguration Defines the configuration for the SMK extension.
 * @property {SourceSMKQueryLink[]} [links] A list of labelled query links to display instead of all artwork.
 */

/**
 * @typedef {object} SourceSMKQueryLink
 * @property {string} label
 * @property {string} query
 * @property {boolean} [hidden]
 */

const apiEndpoint = "https://api.smk.dk/api/v1/art/search";

/**
 * @extends {SourceSegmented<SourceSMKConfiguration>}
 */
export default class SourceSMK extends SourceSegmented {
   get name() { return "SMK"; }

   /**
    * @override @protected
    * @param {string} query 
    * @returns {QueryRetriever | QueryShortcutsRetriever}
    */
   createContentRetriever(query) {
      if (QueryShortcutsRetriever.hasQueryShortcuts(this.configuration) && query === "") {
         //@ts-ignore
         return new QueryShortcutsRetriever(this.configuration?.links)
      } else {
         return new QueryRetriever(query);
      }
   }
}

class QueryShortcutsRetriever extends SourceSegmentedContentRetriever {   
   get pageLength() { return this.#shortcuts.length; }
   
   /** @type {SourceSMKQueryLink[]} */
   #shortcuts;

   /**
    * @typedef {import("../../Dependencies/vistava.js/src/Components/TileGrid/Shared/TileValue.js").TileValueInitializer
    * } TileValueInitializer
    */

   /**
    * @param {SourceSMKQueryLink[]} shortcuts 
    */
   constructor(shortcuts) {
      super("");
      this.#shortcuts = shortcuts;
   }

   /**
    * @param {SourceSMKConfiguration?} configuration 
    * @returns {boolean}
    */
   static hasQueryShortcuts(configuration) {
      return configuration?.links != null &&
         Array.isArray(configuration.links) && configuration.links.length > 0 &&
         configuration.links?.every(e => typeof (e.label) === "string" && typeof (e.query) === "string") &&
         configuration.links.filter(e => !e.hidden).length > 0;
   }

   /**
    * @override
    * @param {number?} [page]
    * @returns {Promise<object[]>}
    */
   getPageTilesAsync(page) {
      if (page === null || page === 0) {
         return Promise.resolve(this.#shortcuts.filter(e => !e.hidden).map(this.#queryToTileValue));
      } else {
         return Promise.resolve([]);
      }
   }

   /** @type {(query:SourceSMKQueryLink)=>TileValueInitializer} */
   #queryToTileValue = query => ({
      label: query.label,
      queryTarget: query.query,
      type: "ChildCollection"
   });
}

class QueryRetriever extends SourceSegmentedContentRetriever {
   get pageLength() { return 25; }

   /** @readonly @type {string} */
   static #userInputToken = "@userinput";

   /** @readonly @type {RateLimiter} */
   #rateLimiter = new RateLimiter(1000);
   /** @type {string?} */
   #userInput = null;
   /** @type {string} */
   #randomSeed = this.#generateRandomSeed();

   /**
    * @typedef {object} ArtworkResponse
    * @property {number} offset
    * @property {number} rows
    * @property {number} found
    * @property {Artwork[]} items
    */

   /**
    * @typedef {object} Artwork
    * @property {string} id
    * @property {string} frontend_url
    * @property {string} image_thumbnail
    * @property {string} image_native
    * @property {Titles[]} titles
    * @property {string[]} artist
    */

   /**
    * @typedef {object} Titles
    * @property {string} title
    * @property {string} language
    */

   /**
    * @override
    * @param {number} page
    * @returns {Promise<TileValueInitializer[]>}
    */
   async getPageTilesAsync(page) {
      await this.#requestUserInputIfRequiredAsync(this.query);
      
      let searchParams = this.#buildURLSearchParams(page);
      let url = `${apiEndpoint}?${searchParams}`;

      let response = await this.#rateLimiter.executeThrottledAsync(async () => await fetch(url));

      if (!response.ok) {
         throw new Error(`The API request failed (code ${response.status})!`);
      } else {
         /** @type {ArtworkResponse} */
         let artworkResponse = await response.json();
         return artworkResponse.items.map(artwork => this.#artworkToTileValueMapper(artwork));
      }
   }

   /** @type {(artwork:Artwork) => TileValueInitializer} */
   #artworkToTileValueMapper = (artwork) => {
      let title = (artwork.titles?.[0]?.title ?? "").trim();
      let artist = (artwork.artist?.[0] ?? "").trim();

      let label = null;
      if (title.length > 0) {
         label = `"${title}"`;
         if (artist.length > 0) {
            label += " by " + artist;
         }
      }

      return {
         label: label,
         thumbnailType: "image/jpeg",
         thumbnailUrl: artwork.image_thumbnail,
         mediaType: "image/jpeg",
         mediaUrl: artwork.image_native,
         sourceUrl: artwork.frontend_url
      }
   };

   /**
    * @param {number} page 
    * @returns {URLSearchParams}
    */
   #buildURLSearchParams(page) {
      let params = new URLSearchParams();

      let keys = this.query.replaceAll(QueryRetriever.#userInputToken, (this.#userInput ?? "").trim()).trim();
      if (keys.length === 0) {
         keys = "*";
      }

      params.set("keys", keys);

      params.set("offset", (page * this.pageLength).toString());
      params.set("rows", this.pageLength.toString());
      params.set("filters", "[has_image:true]");
      params.set("lang", "en");
      // Make sure to retrieve the same randomized results for the current query retriever instance
      params.set("randomHighlights", this.#randomSeed);

      return params;
   }

   /**
    * @param {string} query 
    * @returns {Promise<void>}
    */
   async #requestUserInputIfRequiredAsync(query) {
      if (query?.includes(QueryRetriever.#userInputToken) && this.#userInput == null) {
         this.#userInput = (await Dialog.showInputDialogAsync(
            "Please enter your custom search query in the field below and confirm to start the search:",
            "Enter search query", ["OK", "Cancel"])).textInput ?? "";
      }
   }

   #generateRandomSeed() {
      let string = "";
      for (let i = 0; i < 5; i++) {
         // Append a lowercase character from 'a' (97 in ASCII) to 'z' (+26 letters)
         string += String.fromCharCode(Math.floor(Math.random() * 26 + 97));
      }
      return string;
   }
}