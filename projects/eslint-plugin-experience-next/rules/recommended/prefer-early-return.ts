import {AST_NODE_TYPES, type TSESLint, type TSESTree} from '@typescript-eslint/utils';

import {getLineBreak} from '../utils/ast/spacing';
import {createRule} from '../utils/create-rule';

type Options = [];

type MessageId = 'preferEarlyReturn';

function getIndent(
    node: TSESTree.Node,
    sourceCode: Readonly<TSESLint.SourceCode>,
): string {
    const lineStart = sourceCode.getIndexFromLoc({
        column: 0,
        line: node.loc.start.line,
    });

    return sourceCode.text.slice(lineStart, node.range[0]);
}

function isFunctionBody(node: TSESTree.BlockStatement): boolean {
    const parent = node.parent;

    return (
        parent.type === AST_NODE_TYPES.FunctionDeclaration ||
        parent.type === AST_NODE_TYPES.FunctionExpression ||
        parent.type === AST_NODE_TYPES.ArrowFunctionExpression
    );
}

function canLiftStatement(node: TSESTree.Statement): boolean {
    switch (node.type) {
        case AST_NODE_TYPES.BlockStatement:
        case AST_NODE_TYPES.ClassDeclaration:
        case AST_NODE_TYPES.FunctionDeclaration:
        case AST_NODE_TYPES.LabeledStatement:
        case AST_NODE_TYPES.VariableDeclaration:
        case AST_NODE_TYPES.TSEnumDeclaration:
        case AST_NODE_TYPES.TSInterfaceDeclaration:
        case AST_NODE_TYPES.TSModuleDeclaration:
        case AST_NODE_TYPES.TSTypeAliasDeclaration:
            return false;

        default:
            return true;
    }
}

function negate(
    expression: TSESTree.Expression,
    sourceCode: Readonly<TSESLint.SourceCode>,
): {precedence: number; text: string} {
    if (expression.type === AST_NODE_TYPES.UnaryExpression && expression.operator === '!') {
        const argument = expression.argument;

        return {
            precedence: argument.type === AST_NODE_TYPES.LogicalExpression ? 1 : 3,
            text: sourceCode.getText(argument),
        };
    }

    if (expression.type === AST_NODE_TYPES.LogicalExpression) {
        if (expression.operator === '&&' || expression.operator === '||') {
            const operator = expression.operator === '&&' ? '||' : '&&';
            const precedence = operator === '&&' ? 2 : 1;

            const left = negate(expression.left, sourceCode);
            const right = negate(expression.right, sourceCode);
            const render = (part: typeof left): string =>
                part.precedence < precedence ? `(${part.text})` : part.text;

            return {
                precedence,
                text: `${render(left)} ${operator} ${render(right)}`,
            };
        }
    }

    if (
        expression.type === AST_NODE_TYPES.Identifier ||
        expression.type === AST_NODE_TYPES.MemberExpression ||
        expression.type === AST_NODE_TYPES.CallExpression
    ) {
        return {precedence: 3, text: `!${sourceCode.getText(expression)}`};
    }

    return {precedence: 3, text: `!(${sourceCode.getText(expression)})`};
}

export const rule = createRule<Options, MessageId>({
    create(context) {
        const {sourceCode} = context;

        return {
            IfStatement(node) {
                if (node.alternate || node.consequent.type !== AST_NODE_TYPES.BlockStatement) {
                    return;
                }

                const parent = node.parent;

                if (
                    parent.type !== AST_NODE_TYPES.BlockStatement ||
                    !isFunctionBody(parent) ||
                    parent.body[parent.body.length - 1] !== node
                ) {
                    return;
                }

                const statements = node.consequent.body;
                const [firstStatement] = statements;

                if (
                    !firstStatement ||
                    (statements.length === 1 &&
                        firstStatement.type !== AST_NODE_TYPES.IfStatement) ||
                    !statements.every(canLiftStatement) ||
                    sourceCode.getCommentsInside(node).length > 0
                ) {
                    return;
                }

                const indent = getIndent(node, sourceCode);
                const childIndent = getIndent(firstStatement, sourceCode);

                if (
                    indent.trim() ||
                    !childIndent.startsWith(indent) ||
                    childIndent.length <= indent.length
                ) {
                    return;
                }

                context.report({
                    fix(fixer) {
                        const lastStatement = statements[statements.length - 1];

                        if (!lastStatement) {
                            return null;
                        }

                        const lineBreak = getLineBreak(sourceCode.text);
                        const additionalIndent = childIndent.slice(indent.length);
                        const bodyText = sourceCode.text.slice(
                            firstStatement.range[0],
                            lastStatement.range[1],
                        );

                        const movedBody = bodyText
                            .split(/\r\n|\r|\n/)
                            .map((line, index) =>
                                index > 0 && line.startsWith(childIndent)
                                    ? `${indent}${line.slice(childIndent.length)}`
                                    : line,
                            )
                            .join(lineBreak);

                        const guard = `if (${negate(node.test, sourceCode).text}) {${lineBreak}${childIndent}return;${lineBreak}${indent}}`;

                        return fixer.replaceText(
                            node,
                            `${guard}${lineBreak}${lineBreak}${indent}${movedBody}`,
                        );
                    },
                    messageId: 'preferEarlyReturn',
                    node,
                });
            },
        };
    },
    meta: {
        docs: {
            description:
                'Prefer a guard clause when the last statement of a function wraps nested control flow or multiple statements.',
        },
        fixable: 'code',
        messages: {
            preferEarlyReturn:
                'Invert the condition and return early instead of nesting the remainder of the function.',
        },
        schema: [],
        type: 'suggestion',
    },
    name: 'prefer-early-return',
});

export default rule;
