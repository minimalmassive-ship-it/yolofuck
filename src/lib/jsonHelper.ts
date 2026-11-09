export const safeJsonParse = (str: any, fallback: any = {}) => {
    if (typeof str !== 'string') return str || fallback;
    try {
        return JSON.parse(str);
    } catch (e) {
        console.warn('Failed to parse JSON string:', str);
        return fallback;
    }
};
