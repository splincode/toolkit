import {createRequire} from 'node:module';

import type ts from 'typescript';

export interface StyleRange {
    readonly dynamic: boolean;
    readonly end: number;
    readonly start: number;
}

const requireModule = createRequire(`${process.cwd()}/package.json`);
let typescript: typeof ts | undefined;

function getTypescript(): typeof ts {
    typescript ??= requireModule('typescript') as typeof ts;

    return typescript;
}

function getPropertyName(name: ts.PropertyName): string | null {
    const compiler = getTypescript();
    const supported =
        compiler.isIdentifier(name) ||
        compiler.isStringLiteral(name) ||
        compiler.isNoSubstitutionTemplateLiteral(name);

    return supported ? name.text : null;
}

function getComponentMetadata(
    expression: ts.Expression,
): ts.ObjectLiteralExpression | null {
    const compiler = getTypescript();

    if (!compiler.isCallExpression(expression)) {
        return null;
    }

    const callee = expression.expression;
    let name: string | null = null;

    if (compiler.isIdentifier(callee)) {
        name = callee.text;
    } else if (compiler.isPropertyAccessExpression(callee)) {
        name = callee.name.text;
    }

    if (name !== 'Component') {
        return null;
    }

    const [metadata] = expression.arguments;

    return metadata && compiler.isObjectLiteralExpression(metadata) ? metadata : null;
}

function getLiteralRange(
    node: ts.Expression,
    sourceFile: ts.SourceFile,
): StyleRange | null {
    const compiler = getTypescript();
    const isStatic =
        compiler.isStringLiteral(node) || compiler.isNoSubstitutionTemplateLiteral(node);

    const isDynamic = compiler.isTemplateExpression(node);

    return isStatic || isDynamic
        ? {
              dynamic: isDynamic,
              end: node.getEnd() - 1,
              start: node.getStart(sourceFile) + 1,
          }
        : null;
}

function getStyleRanges(
    initializer: ts.Expression,
    sourceFile: ts.SourceFile,
): StyleRange[] {
    const compiler = getTypescript();
    const direct = getLiteralRange(initializer, sourceFile);

    if (direct) {
        return [direct];
    }

    return compiler.isArrayLiteralExpression(initializer)
        ? initializer.elements.flatMap((element) => {
              const range = getLiteralRange(element, sourceFile);

              return range ? [range] : [];
          })
        : [];
}

export function extractComponentStyles(source: string, filename: string): StyleRange[] {
    const compiler = getTypescript();
    const sourceFile = compiler.createSourceFile(
        filename,
        source,
        compiler.ScriptTarget.Latest,
        true,
        compiler.ScriptKind.TS,
    );

    const ranges: StyleRange[] = [];

    function visit(node: ts.Node): void {
        if (compiler.isClassDeclaration(node) && compiler.canHaveDecorators(node)) {
            for (const decorator of compiler.getDecorators(node) ?? []) {
                const metadata = getComponentMetadata(decorator.expression);

                if (!metadata) {
                    continue;
                }

                for (const property of metadata.properties) {
                    if (
                        compiler.isPropertyAssignment(property) &&
                        getPropertyName(property.name) === 'styles'
                    ) {
                        ranges.push(...getStyleRanges(property.initializer, sourceFile));
                    }
                }
            }
        }

        compiler.forEachChild(node, visit);
    }

    visit(sourceFile);

    return ranges;
}
