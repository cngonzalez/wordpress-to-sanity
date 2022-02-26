
const { nanoid } = require('nanoid')
const parseBody = require('./parseBody')

//this function is designed to isolate sections of Divi Page Builder CDATA and turn it into
//arrays of JSON objects that can then be used in a "pagebuilder" style pattern in Sanity
const parsePageBody = (cdataString, title) => {
  let pageBuilderSections = []

  //first, split into `sections` which seem to isolate the largest unit.
  //those will largely correspond to our page blocks
  const sections = getBlocksOfType(cdataString, 'section')
  console.log(`Found ${sections.length} sections in page ${title}`)

  //next, iterate through the sections to determine what content type block (if any)
  //we're going to push to Sanity
  sections.forEach(section => {
    const sectionColumns = getBlocksOfType(section, 'column')

    //if there's one column, turn everything in it into standalone blocks
    if (sectionColumns.length === 1) {
      pageBuilderSections = [
        ...pageBuilderSections,
        ...createValidChildren(sectionColumns[0])
      ]
    } 
    //if there's multiple columns, store the columns and objects inside of them
    //as a block of type "columns" 
    //it's probably ideal to migrate those later to something more expressive
    else {
      //first, turn every individual column into JSON
      columns = sectionColumns.map(col => {
        columnItems = createValidChildren(col)
        // if (!columnItems.length) {
        //   console.log(`no valid items found in ${col}`)
        // } 

        return {
          _type: 'column',
          _key: nanoid(),
          columnItems
        }
      }).filter(col => col.columnItems.length)
      //then, group them together in one object representing these columns as a group 

      if (columns.length) {
        columnsObj = {
          _key: nanoid(),
          _type: 'columns',
          columns
        }
        pageBuilderSections.push(columnsObj)

      }
    }
  })
  return pageBuilderSections
}

//this is a helper object that maps semantic sections of Divi markup
//to how we might think about them in our pagebuilder
const RegExpMap = {
  section: /\[et_pb_section[\s\S]*?\](?<section>(.|\n|\r)*?)\[\/et_pb_section\]/g,
  column: /\[et_pb_column[\s\S]*?\](?<column>(.|\n|\r)*?)\[\/et_pb_column\]/g,
  row: /\[et_pb_row[\s\S]*?\](?<row>(.|\n|\r)*?)\[\/et_pb_row\]/g,
  text: /\[et_pb_text[\s\S]*?\](?<text>(.|\n|\r)*?)\[\/et_pb_text\]/g,
  img: /\[et_pb_image src=\"(?<img>(.|\n|\r)*?)"/g,
  button: /\[et_pb_button (?<button>(.|\n|\r)*?)\]/g,
  buttonUrl: /button_url="(?<buttonUrl>(.|\n|\r)*?)"/g,
  buttonText: /button_text="(?<buttonText>(.|\n|\r)*?)"/g,
}


//extracts blocks of a type to smaller sections of raw text
const getBlocksOfType = (str, blockType, includeMetadata = false) => {
  //('new RegExp' with a variable behaves a little differently,
  //so just brute forcing the different regexes now)
  const regex = RegExpMap[blockType]
  
  const matches = []
  let m;

  while ((m = regex.exec(str)) !== null) {
    // This is necessary to avoid infinite loops with zero-width matches
    if (m.index === regex.lastIndex) {
      regex.lastIndex++;
    }
    if (includeMetadata) {
      matches.push({index: m.index, match: m[1], blockType})
    } else {
      matches.push(m[1])
    }
  }

  return matches 
}

//filters down Divi markup to objects that are relevant for us
//we're optimizing for text, images, and buttons. 
const createValidChildren = (section) => {
  //create JSON after individual types of subsections
  const rowChildren = getBlocksOfType(section, 'row', true)
    .map(rowMatch => ({
      index: rowMatch.index,
      object: handleRow(rowMatch.match)
    }))
  const imageChildren = getBlocksOfType(section, 'img', true)
    .map(imgMatch => ({
      index: imgMatch.index,
      object: handleImage(imgMatch.match)
    }))
  const textChildren = getBlocksOfType(section, 'text', true)
    .map(textMatch => ({
      index: textMatch.index,
      object: handleText(textMatch.match)
    }))
  const buttonChildren = getBlocksOfType(section, 'button', true)
    .map(buttonMatch => ({
      index: buttonMatch.index,
      object: handleButton(buttonMatch.match)
    }))

    const children = [
      ...rowChildren,
      ...imageChildren,
      ...textChildren,
      ...buttonChildren
    ] 

    //sort in the correct page order and return the object
    return children.sort((el1, el2) => el1.index - el2.index)
      .map(indexedMatch => indexedMatch.object)
      .filter(Boolean)
}

const handleRow = (rowStr) => {
  const rowItems = createValidChildren(rowStr)
  if (!rowItems.length) { return null }
  if (rowItems.length == 1) {
    return rowItems[0]
  }

  return {
    _type: 'row',
    _key: nanoid(),
    rowItems
  }
}

const handleButton = (buttonStr) => {
  const buttonUrl = getBlocksOfType(buttonStr, 'buttonUrl')[0]
  const buttonText = getBlocksOfType(buttonStr, 'buttonText')[0]
  return {
    _key: nanoid(),
    _type: 'button',
    buttonUrl,
    buttonText 
  }
}

const handleImage = (imgStr) => {
  return {
    _key: nanoid(),
    _type: 'image',
    _sanityAsset: `image@${imgStr
      .replace(/^\//, 'https://')}`
  }

}

const handleText = (textStr) => {
  const text = parseBody(textStr)
  if (!text.length) {
    return null
  }
  return {
    _key: nanoid(),
    _type: 'textBlock',
    text
  }
}

module.exports = (cdataString, title) => parsePageBody(cdataString, title)