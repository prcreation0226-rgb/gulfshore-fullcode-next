function capitalizeFirstLetter(word: string) {
    return word.charAt(0).toUpperCase() + word.slice(1);
}
export default function capitalizeWords(sentence: string) {
    if (!sentence) return '';
    sentence = sentence.trim().toLowerCase();
    return sentence.split(' ').map(word => capitalizeFirstLetter(word)).join(' ');
}