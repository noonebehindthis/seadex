window.newRows = {}
window.deletedRows = {}

// TODO: I don't want this workaround, make it a nice UI
// transforms siteAddresses-array to string and vice-versa
const workaroundAddressArray = (data, target = "array") => {
    if (Array.isArray(data) && target === "string") {
        return data.join(", ")
    } else if (typeof data === "string" && target === "array") {
        return data.split(", ")
    } else {
        return data
    }
}


const postUpdateData = (tableId, data, method = "update") => {
    if (!window.editMode) {
        return console.error("You are not in edit-mode...")
    }

    console.log("[API] Method:", method, "for table:", tableId, data)
    fetch("/api/" + method + "/" + tableId, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(data)
    })
        .then(resp => handleAPIResponse(resp, tableId, null, data))
        .catch(err => {
            if (err !== "api call failed") {
                console.log(err)
            }
        })
        .finally( () => {
            window.saveProgress -= 1
        })
}

const postDeleteRow = (tableId, id) => {
    if (!window.editMode) {
        return console.error("You are not in edit-mode...")
    }

    console.log("[API] Method: delete for table:", tableId, id)
    fetch("/api/delete/" + tableId + "/" + id)
        .then(resp => handleAPIResponse(resp, tableId, id))
        .catch(err => {
            if (err !== "api call failed") {
                console.log(err)
            }
        })
        .finally( () => {
            window.saveProgress -= 1
        })
}

const handleAPIResponse = (resp, tableId, id = null, data = null) => {
    (async (resp) => {
        if (resp.status === 200) {
            return resp.text()
        } else {
            console.log("[API] Status: " + resp.status)
            return Promise.reject("api call failed")
        }
    })(resp)
        .then(result => {
            switch (result) {
                case "table does not exist":
                    return console.error("[API] Failed to find table:", tableId)
                case "received no POST JSON data":
                    return console.error("[API] No data sent on tableUpdate", tableId, data)
                case "id does not exist":
                    return console.error("[API] ID", id, " could not be found in table", tableId, data)
                case "updated":
                    return console.log("[API] Successfully updated row", id, " of table", tableId, data)
                case "inserted":
                    return console.log("[API] Successfully inserted row of table", tableId, data)
                case "deleted":
                    return console.log("[API] Successfully deleted row", id, " of table", tableId)
                default:
                    return console.error("[API] Unknown response", result, "for tableUpdate", tableId, data, id)
            }
        })
}

const addTableRow = (el) => {
    if (!window.editMode) {
        return console.error("You are not in edit-mode...")
    }

    const id = el.getAttribute("data-target")
    console.log("Adding row to table", id)

    window.dataTables[id].addRow({}, true)
        .then(row => {
            if (!window.newRows[id]) {
                window.newRows[id] = [row]
            } else {
                window.newRows[id].push(row)
            }

            row.scrollTo()
        })
        .catch(e => {
            console.error("Failed to create new row for", id, "due to", e)
        })

}

const deleteSelectedRow = (el) => {
    if (!window.editMode) {
        return console.error("You are not in edit-mode...")
    }

    const id = el.getAttribute("data-target")
    console.log("Delete selected rows of table", id)
    if (!window.deletedRows[id]) {
        window.deletedRows[id] = window.dataTables[id].getSelectedRows().map(r => r.getData())
    } else {
        window.dataTables[id].getSelectedRows().forEach(r => {
            const data = r.getData()
            if (!window.deletedRows[id].includes(data)) {
                window.deletedRows[id].push(data)
            }
        })
    }

    window.dataTables[id].getSelectedRows().forEach(r => r.delete())
    document.querySelector("#delete-" + id).disabled = true
}

const isValidTable = (id) => {
    return !window.dataTables[id].getRows().some(r => {
        let d = r.getData()
        let invalid = !d["siteName"] || !d["siteAddresses"]
        if (!invalid) {
            d["siteAddresses"] = workaroundAddressArray(d["siteAddresses"], "array")
            invalid = d["siteAddresses"].some(site => !validateUrl(site)) || d["siteAddresses"].length === 0
        }

        if (invalid) {
            r.scrollTo()
        }
        return invalid
    })
}

const discardTableEdit = (el) => {
    if (!window.editMode) {
        return console.error("You are not in edit-mode...")
    }

    const id = el.getAttribute("data-target")
    console.log("Discarding edits to table", id)

    // undo all edited cells
    window.dataTables[id].setData(window.rawData[id])
    resetTableEditState(id)
}

const setEditHistoryButtonState = (id) => {
    // for undo we need to check editedCells as well, due to DOM-Rendering triggering a data-change, which breaks history
    document.querySelector("#undo-" + id).disabled = (
        window.dataTables[id].getHistoryUndoSize() === 0 || window.dataTables[id].getEditedCells().length === 0 &&
        (!window.deletedRows[id] || window.deletedRows[id].length === 0)
    )
    document.querySelector("#redo-" + id).disabled = (
        window.dataTables[id].getHistoryRedoSize() === 0
    )

    document.querySelector("#discard-" + id).disabled = (
        window.dataTables[id].getEditedCells().length === 0 && (!window.newRows[id] || window.newRows[id].length === 0) &&
        (window.deletedRows[id] && window.deletedRows[id].length > 0)
    )
    document.querySelector("#save-" + id).disabled = (
        !isValidTable(id) || window.dataTables[id].getEditedCells().length === 0 &&
        (!window.deletedRows[id] || window.deletedRows[id].length === 0)
    )

    // checks if table has been edited or not
    if (!window.editedTables.includes(id) && window.dataTables[id].getEditedCells().length > 0) {
        window.editedTables.push(id)
    } else if (window.dataTables[id].getEditedCells().length === 0) {
        window.editedTables.filter(t => t !== id)
    }
}

const undoTableEdit = (el) => {
    if (!window.editMode) {
        return console.error("You are not in edit-mode...")
    }

    const id = el.getAttribute("data-target")
    console.log("Undo edit of table", id)

    window.dataTables[id].undo()
    if (window.deletedRows[id]) {
        window.dataTables[id].getData().forEach(d => {
            window.deletedRows[id] = window.deletedRows[id].filter(r => r !== d)
        })
    }
    setEditHistoryButtonState(id)
}

const redoTableEdit = (el) => {
    if (!window.editMode) {
        return console.error("You are not in edit-mode...")
    }

    const id = el.getAttribute("data-target")
    console.log("Redo edit of table", id)

    window.dataTables[id].redo()
    if (window.deletedRows[id]) {
        window.dataTables[id].getData().forEach(d => {
            if (!window.deletedRows[id].includes(d)) {
                window.deletedRows[id].push(d)
            }
        })
    }
    setEditHistoryButtonState(id)
}

const saveTableEdit = (el) => {
    if (!window.editMode) {
        return console.error("You are not in edit-mode...")
    }

    const id = el.getAttribute("data-target")
    console.log("Saving table", id)
    let rows = window.dataTables[id].getEditedCells().map(c => c.getRow())
    if (!isValidTable(id)) {
        console.error("Illegal submit, missing name or url")
        return
    }

    // find update rows
    let uniques = new Set()
    let updateRows = rows.filter(r => {
        const duplicate = uniques.has(r)
        uniques.add(r)
        if (window.newRows[id]) {
            return !window.newRows[id].includes(r) && !duplicate
        }
        return !duplicate
    }).map(r => {
        let d = r.getData()
        d["siteAddresses"] = workaroundAddressArray(d["siteAddresses"], "array")
        return d
    })
    console.log("Update rows:", updateRows)

    // find new rows
    uniques = new Set()
    let newRows = rows.filter(r => {
        if (window.newRows[id]) {
            const duplicate = uniques.has(r)
            uniques.add(r)
            return window.newRows[id].includes(r) && !duplicate
        }
        return false
    }).map(r => {
        let d = r.getData()
        d["siteAddresses"] = workaroundAddressArray(d["siteAddresses"], "array")
        return d
    })
    console.log("Create new rows:", newRows)

    if (newRows.length === 0 && updateRows.length === 0 && (!window.deletedRows[id] || window.deletedRows[id].length === 0)) {
        console.error("What... abort, there is nothing to send")
        return
    }

    window.saveProgress = updateRows.length + newRows.length
    updateRows.forEach(data => postUpdateData(id, data))
    newRows.forEach(data => postUpdateData(id, data, "insert"))
    if (window.deletedRows[id]) {
        window.deletedRows[id].forEach(data => postDeleteRow(id, data["id"]))
    }

    setTimeout(() => reloadAfterEdit(id), 500)
}

const reloadAfterEdit = (id) => {
    if (window.saveProgress > 0) {
        setTimeout(() => reloadAfterEdit(id), 500)
        return console.log("Save not finished yet...")
    }

    console.log("Save finished, reload saved data")
    window.dataTables[id].setData("/api/fetch/data/" + id)

    // reset edit-history
    resetTableEditState(id)
    window.deletedRows[id] = []
    window.newRows[id] = []
    if (window.editedTables.includes(id)) {
        window.editedTables = window.editedTables.filter(t => t !== id)
    }
}

const resetTableEditState = (id) => {
    if (!window.editMode) {
        return console.error("You are not in edit-mode...")
    }

    console.log("Resetting tableEdit of", id)
    window.dataTables[id].clearHistory()
    document.querySelector("#undo-" + id).disabled = true
    document.querySelector("#redo-" + id).disabled = true
    document.querySelector("#discard-" + id).disabled = true
    document.querySelector("#save-" + id).disabled = true
}

window.addEventListener('tablesGenerated', () => {
    if (window.editMode) {
        Object.keys(window.dataTables).forEach(id => {
            resetTableEditState(id)
        })
    }
})

const toggleEditMode = () => {
    console.log("Switching editMode", window.editMode, "->", !window.editMode)
    window.editMode = !window.editMode
    document.querySelectorAll(".editor-only").forEach(node => {
        if (node.style.display === "none") {
            if (window.editMode) {
                node.style.display = null
            }
        } else if (!window.editMode) {
            node.style.display = "none"
        }
    })
    document.querySelector("#editToggle").innerHTML =
        window.editMode ? '<i class="bi bi-pencil"></i> Disable Edit': '<i class="bi bi-pencil"></i> Enable Edit'

    Object.keys(window.dataTables).forEach(key => {
        window.dataTables[key].setColumns(getColumnsDefinition(tableById(key)))
    })

}