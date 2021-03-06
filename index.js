"use strict";

/**
 * Plugin for Remarkable Markdown processor which transforms $$..$$ and $$$..$$$ sequences into math HTML using the
 * Katex package.
 */
module.exports = function(md, options) {

    var katex = require("katex");

    function renderKatex(source, displayMode) {
        return katex.renderToString(source, {displayMode: displayMode, throwOnError: false});
    }

    /**
     * Parse '££' as a block. I don't think this is needed since it is already done in the parseInlineKatex
     * method. Based off of similar method in remarkable.
     */
    function parseBlockKatex(state, startLine, endLine) {
        var marker, len, params, nextLine, mem,
            haveEndMarker = false,
            pos = state.bMarks[startLine] + state.tShift[startLine],
            max = state.eMarks[startLine];
        var dollar = 0x24;

        if (pos + 1 > max) { return false; }

        marker = state.src.charCodeAt(pos);
        if (marker !== dollar) { return false; }

        // scan marker length
        mem = pos;
        pos = state.skipChars(pos, marker);
        len = pos - mem;

        if (len != 2)  { return false; }

        // search end of block
        nextLine = startLine;

        for (;;) {
            ++nextLine;
            if (nextLine >= endLine) {

                // unclosed block should be autoclosed by end of document.
                // also block seems to be autoclosed by end of parent
                break;
            }

            pos = mem = state.bMarks[nextLine] + state.tShift[nextLine];
            max = state.eMarks[nextLine];

            if (pos < max && state.tShift[nextLine] < state.blkIndent) {

                // non-empty line with negative indent should stop the list:
                // - ```
                //  test
                break;
            }

            if (state.src.charCodeAt(pos) !== dollar) { continue };

            if (state.tShift[nextLine] - state.blkIndent >= 4) {

                // closing fence should be indented less than 4 spaces
                continue;
            }

            pos = state.skipChars(pos, marker);

            // closing code fence must be at least as long as the opening one
            if (pos - mem < len) { continue; }

            // make sure tail has spaces only
            pos = state.skipSpaces(pos);

            if (pos < max) { continue; }

            haveEndMarker = true;

            // found!
            break;
        }

        // If a fence has heading spaces, they should be removed from its inner block
        len = state.tShift[startLine];

        state.line = nextLine + (haveEndMarker ? 1 : 0);
        
        var content = state.getLines(startLine + 1, nextLine, len, true)
                           .replace(/[ \n]+/g, ' ')
                           .trim();

        state.tokens.push({
            type: 'katex',
            params: params,
            content: content,
            lines: [startLine, state.line],
            level: state.level,
            block: true
        });

        return true;
    }

    /**
     * Look for '$$' or '$$$' spans in Markdown text. Based off of the 'fenced' parser in remarkable.
     */
    function parseInlineKatex(state, silent) {
        var dollar = 0x24;
        var pos = state.pos;
        var start = pos, max = state.posMax, marker, matchStart, matchEnd ;

        if (state.src.charCodeAt(pos) !== dollar) { return false; }
        ++pos;

        while (pos < max && state.src.charCodeAt(pos) === dollar) {
            ++pos;
        }

        marker = state.src.slice(start, pos);
        if (marker.length < 2 || marker.length > 3) { return false; }

        matchStart = matchEnd = pos;
        
        while ((matchStart = state.src.indexOf('$', matchEnd)) !== -1) {
            matchEnd = matchStart + 1;
            
            while (matchEnd < max && state.src.charCodeAt(matchEnd) === dollar) {
                ++matchEnd;
            }
            
            if (matchEnd - matchStart == marker.length) {
                if (!silent) {
                    var content = state.src.slice(pos, matchStart)
                                           .replace(/[ \n]+/g, ' ')
                                           .trim();

                    state.push({
                        type: 'katex',
                        content: content,
                        block: marker.length > 2,
                        level: state.level
                    });
                }

                state.pos = matchEnd;
                return true;
            }
        }

        if (! silent) state.pending += marker;
        state.pos += marker.length;

        return true;
    }

    md.inline.ruler.push('katex', parseInlineKatex, options);
    md.block.ruler.push('katex', parseBlockKatex, options);
    md.renderer.rules.katex = function(tokens, idx) {
        return renderKatex(tokens[idx].content, tokens[idx].block);
    };
};
