declare module 'postcss-less' {
    import {type Node, type ProcessOptions, type Root} from 'postcss';

    type Builder = (output: string, node?: Node, type?: string) => void;
    type Stringifiable = string | {toString(): string};

    const syntax: {
        parse(source: Stringifiable, opts?: ProcessOptions): Root;
        stringify(node: Node, builder: Builder): void;
    };

    export default syntax;
}
