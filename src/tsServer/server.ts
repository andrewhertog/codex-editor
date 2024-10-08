import {
    createConnection,
    TextDocuments,
    ProposedFeatures,
    InitializeParams,
    TextDocumentSyncKind,
    InitializeResult,
    TextDocumentPositionParams,
    CodeActionParams,
    PublishDiagnosticsParams,
    CompletionContext,
    Connection,
    Hover,
    DocumentSymbol,
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import {
    SpellChecker,
    SpellCheckDiagnosticsProvider,
    SpellCheckCodeActionProvider,
    SpellCheckCompletionItemProvider,
} from "./spellCheck";
import { WordSuggestionProvider } from "./forecasting";
import { URI } from "vscode-uri";

const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);

let spellChecker: SpellChecker;
let diagnosticsProvider: SpellCheckDiagnosticsProvider;
let codeActionProvider: SpellCheckCodeActionProvider;
let completionItemProvider: SpellCheckCompletionItemProvider;
let wordSuggestionProvider: WordSuggestionProvider;

connection.onInitialize((params: InitializeParams) => {
    const workspaceFolder = params.workspaceFolders?.[0].uri;
    console.log(`Initializing with workspace folder: ${workspaceFolder}`);

    // Initialize services
    spellChecker = new SpellChecker(workspaceFolder);
    diagnosticsProvider = new SpellCheckDiagnosticsProvider(spellChecker);
    codeActionProvider = new SpellCheckCodeActionProvider(spellChecker);
    completionItemProvider = new SpellCheckCompletionItemProvider(spellChecker);

    if (workspaceFolder) {
        const fsPath = URI.parse(workspaceFolder).fsPath;
        console.log(
            `Creating WordSuggestionProvider with workspace folder: ${fsPath}`,
        );
        wordSuggestionProvider = new WordSuggestionProvider(fsPath);
    } else {
        console.warn(
            "No workspace folder provided. WordSuggestionProvider not initialized.",
        );
    }

    const result: InitializeResult = {
        capabilities: {
            textDocumentSync: TextDocumentSyncKind.Incremental,
            completionProvider: {
                resolveProvider: false,
                triggerCharacters: [" "],
            },
            codeActionProvider: true,
            hoverProvider: true,
            documentSymbolProvider: true,
            executeCommandProvider: {
                commands: [
                    "spellcheck.addToDictionary",
                    "server.getSimilarWords",
                ],
            },
        },
    };
    return result;
});

documents.onDidChangeContent((change) => {
    const diagnostics = diagnosticsProvider.updateDiagnostics(change.document);
    connection.sendDiagnostics({ uri: change.document.uri, diagnostics });
});

connection.onCompletion((params: TextDocumentPositionParams) => {
    const document = documents.get(params.textDocument.uri);
    if (!document) return [];

    // Create a dummy CancellationToken since we don't have one in this context
    const dummyToken = {
        isCancellationRequested: false,
        onCancellationRequested: () => ({ dispose: () => {} }),
    };

    // Create a default CompletionContext
    const defaultContext: CompletionContext = {
        triggerKind: 1, // Invoked
        triggerCharacter: undefined,
    };

    const spellCheckSuggestions = completionItemProvider.provideCompletionItems(
        document,
        params.position,
        dummyToken,
        defaultContext,
    );
    const wordSuggestions = wordSuggestionProvider.provideCompletionItems(
        document,
        params.position,
        dummyToken,
        defaultContext,
    );
    return [...spellCheckSuggestions, ...wordSuggestions];
});

connection.onCodeAction((params: CodeActionParams) => {
    const document = documents.get(params.textDocument.uri);
    if (!document) return [];

    return codeActionProvider.provideCodeActions(
        document,
        params.range,
        params.context,
    );
});

// TODO: Implement other handlers (hover, document symbols, etc.)

// Add this new handler
connection.onExecuteCommand(async (params) => {
    console.log("Received execute command:", params.command);

    if (params.command === "spellcheck.addToDictionary" && params.arguments) {
        const word = params.arguments[0];
        await spellChecker.addToDictionary(word);
        // Notify the client that the dictionary has been updated
        connection.sendNotification("spellcheck/dictionaryUpdated");
    }

    if (params.command === "server.getSimilarWords") {
        console.log("Handling server.getSimilarWords command");
        const [word] = params.arguments || [];
        if (typeof word === "string") {
            try {
                console.log(`Getting similar words for: ${word}`);
                const similarWords =
                    wordSuggestionProvider.getSimilarWords(word);
                console.log("Similar words:", similarWords);
                return similarWords;
            } catch (error) {
                console.error("Error getting similar words:", error);
                return [];
            }
        } else {
            console.error("Invalid arguments for server.getSimilarWords");
            return [];
        }
    }
    // ... other command handlers ...
});

connection.onRequest("spellcheck/check", async (params: { text: string }) => {
    const words = params.text.split(/\s+/);
    const matches = words
        .map((word, index) => {
            const spellCheckResult = spellChecker.spellCheck(word);
            const offset = params.text.indexOf(word);
            console.log("spell-checker-debug: spellCheckResult", {
                spellCheckResult,
            });
            if (spellCheckResult.corrections.length > 0) {
                return {
                    id: `UNKNOWN_WORD_${index}`,
                    text: word,
                    replacements: spellCheckResult.corrections
                        .filter((c) => !!c)
                        .map((correction) => ({ value: correction })),
                    offset: offset,
                    length: word.length,
                };
            }
            return null;
        })
        .filter((match) => match !== null);

    return matches;
});

connection.onRequest("spellcheck/addWord", async (params: { word: string }) => {
    console.log("Received addWord request:", params.word);
    await spellChecker.addToDictionary(params.word.toLowerCase());
    return { success: true };
});

connection.onHover((params: TextDocumentPositionParams): Hover | null => {
    // For now, return null to indicate no hover information
    return null;
});

connection.onDocumentSymbol((params): DocumentSymbol[] => {
    // For now, return an empty array to indicate no document symbols
    return [];
});

documents.listen(connection);
connection.listen();
