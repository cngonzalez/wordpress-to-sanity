#!/usr/bin/env node

/* eslint-disable id-length, no-console, no-process-env, no-sync, no-process-exit */
const fs = require('fs')
const path = require('path');
const { log } = console
const XmlStream = require('xml-stream')
const parseDate = require('./lib/parseDate')
const parseBody = require('./lib/parseBody')
const slugify = require('slugify')
const ndjson = require('ndjson');
const parsePageBody = require('./lib/parsePageBody')

function generateAuthorId (id) {
  return `author-${id}`
}

function generateCategoryId (id) {
  return `category-${id}`
}

function readFile (path = '') {
  if (!path) {
    return console.error('You need to set path')
  }
  return fs.createReadStream(path)
}

async function buildJSONfromStream (stream) {
  const xml = await new XmlStream(stream)

  return new Promise((res, rej) => {
    /**
     * Get some meta info
     */
    const meta = {}
    xml.on('text: wp:base_site_url', url => {
      meta.rootUrl = url.$text
    })

    /**
     * Get the categories
     */
    const categories = []
    xml.on('endElement: category', wpCategory => {
      try {
        const { nicename } = wpCategory.$
        const category = {
          _type: 'category',
          _id: generateCategoryId(nicename),
          title: nicename
        }
        if (!categories.find(cat => cat._id == category._id)) {
          categories.push(category)
        }
      } catch(e) {
        console.log('category error', e)
      }
    })

    /**
     * Get the users
     */
    const users = []
    xml.on('endElement: wp:author', author => {
      try {
      const user = {
        _type: 'author',
        _id: generateAuthorId(author['wp:author_id']),
        name: author['wp:author_display_name'],
        slug: {
          current: slugify(author['wp:author_login'], { lower: true })
        },
        email: author['wp:author_email']
      }
      users.push(user)

      } catch (e) {
        console.log('author error', e)
      }
    })
    /**
     * Get the posts
     */
    const pages = []
    xml.collect('wp:postmeta')
    xml.on('endElement: item', item => {
      try {
        const { title, category, link: permalink, description } = item
        const page = {
          _type: 'page',
          title,
          slug: {
            current: slugify(title, { lower: true })
          },
          categories: [
            {
              _type: 'reference',
              _ref: generateCategoryId(category.$.nicename)
            }
          ],
          description,
          publishedAt: (item['wp:post_date_gmt'] || item['wp:post_date']) ? parseDate(item) : '',
          pageBuilder: parsePageBody(item['content:encoded'], title)
        }
        pages.push(page)
      } catch(e) {
        console.log('page error', e)
      }

    })

    // there seems to be a bug where errors is not caught
    xml.on('error', err => {
      throw new Error(err)
    })

    xml.on('end', () => {
      const output = [
        /* meta, */
        ...users,
        ...pages,
        ...categories
      ]
      return res(output)
    })
  })
}

async function main () {
  const filename = './example.xml'
  const stream = await readFile(filename)
  const output = await buildJSONfromStream(stream)
  const transformStream = ndjson.stringify();
  const target = path.join(__dirname, '..', 'data.ndjson')
  const outputStream = transformStream.pipe(
    fs.createWriteStream(target) );
  output.forEach(document => {
    transformStream.write(document)
  })

  transformStream.end();
  outputStream.on(
    "finish",
    function handleFinish() {
      console.log(`dumped to ${target}!`);
    }
  )

}

main()
