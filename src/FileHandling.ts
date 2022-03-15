/**
 * Asks the user to open a folder
 * @returns array of files and directories in the selected folder
 */
export async function get_folder(): Promise<FileSystemFileHandle[]> {
    if (!window.showDirectoryPicker) {
        alert("Your browser does not support the required filesystem apis, try using Chrome or the new Edge");
        throw "No Directory Picker";
    }


    let ret: FileSystemFileHandle[] = [];

    const folder = await window.showDirectoryPicker({});
    let it = folder.entries();
    while (true) {
        let maybe_file = await it.next();
        if (maybe_file.done) break;

        const file: FileSystemFileHandle | FileSystemDirectoryHandle = maybe_file.value[1];

        if (file instanceof FileSystemFileHandle) {
            ret.push(file);
        }
    }

    return ret;
}

/**
 * Asks the user to open a file
 * @returns The file that the user selected
 */
export async function get_file(): Promise<FileSystemFileHandle> {
    if (!window.showDirectoryPicker) {
        alert("Your browser does not support the required filesystem apis, try using Chrome or the new Edge");
        throw "No Directory Picker";
    }
    const files = await window.showOpenFilePicker({ multiple: false });
    return files[0];
}

/**
 * Get extension of a file
 * @param file file
 * @returns The extension of the file
 */
export function extension_of(file: FileSystemFileHandle): string {
    const parts = file.name.split('.');
    return parts[parts.length - 1];
}

