// SPDX-License-Identifier: GPL-3.0-or-later

import { pack } from '7zip-min';
import { existsSync, rmSync } from "fs";
import { join } from "path";

const sourceDirectory = "Sources";
const outputDirectory = "dist";
const extensionBundleFileExtension = "vex.zip";

try {
   let extensionIdentifier = (process.argv[2] ?? "").trim();

   if (extensionIdentifier.length === 0) {
      throw new Error("No valid extension identifier was specified!");
   }
   // To play it safe, only allow lowercase chars, digits and underscores to avoid potential fuckups on different OSes
   if (!/^[a-z0-9_]+$/.test(extensionIdentifier)) {
      throw new Error("The specified extension identifier is invalid! " +
         "Only lowercase letters, digits and underscores are allowed.");
   }

   let expectedExtensionDefinitionFileName = `${extensionIdentifier}.source.json`;
   let expectedExtensionSourceDirectoryName = `${extensionIdentifier}`;
   let bundleFileName = `${extensionIdentifier}.${extensionBundleFileExtension}`;

   let expectedExtensionDefinitionFilePath = join(sourceDirectory, expectedExtensionDefinitionFileName);
   let expectedExtensionSourceDirectoryPath = join(sourceDirectory, expectedExtensionSourceDirectoryName);
   let extensionBundleTargetFilePath = join(outputDirectory, bundleFileName);

   if (!existsSync(expectedExtensionDefinitionFilePath)) {
      throw new Error(`The extension definition file "${expectedExtensionDefinitionFilePath}" wasn't found!`);
   }
   if (!existsSync(expectedExtensionSourceDirectoryPath)) {
      throw new Error(`The extension source files directory "${expectedExtensionDefinitionFilePath}" wasn't found!`);
   }
   if (existsSync(extensionBundleTargetFilePath)) {
      console.info(`Found existing extension bundle file under "${extensionBundleTargetFilePath}" - overwriting...`);
      rmSync(extensionBundleTargetFilePath);
   } else {
      console.info(`Creating new extension bundle file under "${extensionBundleTargetFilePath}"...`);
   }

   try {
      // Change working directory into the "Sources" directory to avoid 7zip adding that parent directory into
      // the archive (which could probably be done better, but it works so whatever)
      process.chdir(sourceDirectory);
      await pack(join("..", expectedExtensionDefinitionFilePath), join("..", extensionBundleTargetFilePath));
      await pack(join("..", expectedExtensionSourceDirectoryPath), join("..", extensionBundleTargetFilePath));
   } catch (error) {
      throw new Error(`Creating extension bundle failed: ${error}`);
   }

   console.info(`SUCCESS: Created extension bundle under "${extensionBundleTargetFilePath}".`);
} catch (error) {
   console.error(`${error}`);
}