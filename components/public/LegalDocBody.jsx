import styles from './LegalDocBody.module.css'

function Block({ block }) {
  if (block.type === 'p') {
    return <p>{block.text}</p>
  }
  if (block.type === 'p-html') {
    return <p dangerouslySetInnerHTML={{ __html: block.html }} />
  }
  if (block.type === 'ul') {
    return (
      <ul>
        {block.items.map(item => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    )
  }
  if (block.type === 'ul-html') {
    return (
      <ul>
        {block.items.map(item => (
          <li key={item} dangerouslySetInnerHTML={{ __html: item }} />
        ))}
      </ul>
    )
  }
  if (block.type === 'highlight') {
    return (
      <div className={styles.highlightBox}>
        <p dangerouslySetInnerHTML={{ __html: block.html }} />
      </div>
    )
  }
  return null
}

export default function LegalDocBody({ sections }) {
  return (
    <div className={styles.docBody}>
      {sections.map(section => (
        <section key={section.id} id={section.id} className={styles.docSection}>
          <h2>{section.heading}</h2>
          {section.blocks.map((block, index) => (
            <Block key={index} block={block} />
          ))}
        </section>
      ))}
    </div>
  )
}
