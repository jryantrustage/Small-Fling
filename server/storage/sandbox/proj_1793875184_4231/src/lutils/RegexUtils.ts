class RegexUtils {
public isNotApplicableString = (value: string): boolean => {
return /^\s*[Nn]\s*\/?\s*[Aa]\s*$/.test(value);
};
}

export const regexUtils = new RegexUtils();
