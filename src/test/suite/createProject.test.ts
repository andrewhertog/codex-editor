import * as assert from "assert";
import * as vscode from "vscode";
import { CellTypes, createProjectNotebooks } from "../../utils/codexNotebookUtils";
import { getProjectMetadata } from "../../utils/utils";
import * as sinon from "sinon";
import * as path from "path";
import { LanguageProjectStatus, LanguageMetadata } from "../../types";

suite("createProjectNotebooks Test Suite", () => {
    // The sandbox is effectively a blank workspace where we can populate test files
    let sandbox: sinon.SinonSandbox;

    setup(() => {
        sandbox = sinon.createSandbox();
        const workspaceFolder = {
            uri: vscode.Uri.file(path.join(__dirname, "workspaceFolder")),
            name: "TestWorkspace",
            index: 0,
        };
        sandbox
            .stub(vscode.workspace, "workspaceFolders")
            .value([workspaceFolder]);
    });

    teardown(() => {
        sandbox.restore();
    });
    vscode.window.showInformationMessage(
        "Start all tests for createProjectNotebooks.",
    );

    test("createProjectNotebooks creates notebooks with correct metadata, at the correct target-language tag path", async () => {
        const shouldOverWrite = false;
        await createProjectNotebooks({ shouldOverWrite });

        // Assuming the notebooks are created in the workspace directory
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            assert.fail("No workspace folders found");
        }

        const workspacePath = workspaceFolders[0].uri.fsPath;
        const projectMetadata = await getProjectMetadata();
        const targetLanguage = projectMetadata.languages.filter((language: LanguageMetadata) => language.projectStatus === LanguageProjectStatus.TARGET)[0].tag;

        const generatedCodexFile = await vscode.workspace.fs.readFile(
            vscode.Uri.file(`${workspacePath}/drafts/${targetLanguage}/GEN.codex`),
        );

        // Parse the generatedCodexFile as JSON
        const codexContent = JSON.parse(generatedCodexFile.toString());

        const firstCellIsChapterHeadingType =
            codexContent.cells[0].metadata.type === CellTypes.CHAPTER_HEADING;
        const firstCellIsMetadataIsPresent =
            codexContent.cells[0].metadata.data.chapter === "1";

        assert.ok(
            firstCellIsChapterHeadingType && firstCellIsMetadataIsPresent,
            "createProjectNotebooks should create notebooks without overwrite",
        );
    });
});
