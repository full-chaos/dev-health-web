/**
 * Page scroll lock shared by modal surfaces. It counts holders: the first lock saves the page's own
 * `overflow`, the last unlock restores it. A modal that hands over to another modal (the second
 * opens before the first one's cleanup runs) therefore never restores a value the other changed,
 * and never leaves the page locked.
 */
let holders = 0;
let saved = "";

export function lockBodyScroll(): () => void {
    if (holders === 0) saved = document.body.style.overflow;
    holders += 1;
    document.body.style.overflow = "hidden";
    let released = false;
    return () => {
        if (released) return;
        released = true;
        holders -= 1;
        if (holders === 0) document.body.style.overflow = saved;
    };
}
