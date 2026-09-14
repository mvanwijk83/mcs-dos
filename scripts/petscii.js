// Native SEQ text uses CR line endings and the C64 mixed-case character set.
module.exports = function petscii(text) {
    return Buffer.from([...text.replace(/\r?\n/g, '\r')].map(character => {
        const code = character.charCodeAt(0);
        if (code >= 97 && code <= 122) return code - 32;
        if (code >= 65 && code <= 90) return code + 128;
        return code;
    }));
};
